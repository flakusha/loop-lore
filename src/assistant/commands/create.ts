// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /create — Create game entities from a description, with quality gating.
 *
 * Subcommands:
 *   /create char <desc>   — Generate a character
 *   /create loc <desc>    — Generate a location
 *   /create world <desc>  — Generate a world
 *   /create item <desc>   — Generate an item
 * Flow: generate → quality gates (schema/duplicate/consistency) → return a
 * `create-entity-preview` action carrying the validated draft. The entity is
 * NOT persisted here; the user must confirm via the preview, which calls
 * `POST /api/chats/:id/create-entity` (see `create-entity-confirm.ts`).
 */
import { ChatParticipantRole, } from "../../db/enums";
import { resolveProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, } from "../../generation/providers/types";
import { safeJsonParse, } from "../../utils";
import {
  ENTITY_KIND_ALIASES,
  type EntityKind,
  resolveEntityGenerationPrompt,
  VALID_ENTITY_TOKENS,
} from "../prompt/templates/entity-generation";
import {
  type GeneratedEntity,
  normalizeEntity,
  runQualityGates,
} from "../quality/entity-creation";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";
const KIND_LABELS: Record<EntityKind, string> = {
  character: "Character",
  location: "Location",
  world: "World",
  item: "Item",
};

/*** Pull the active world context (name + description) if a world is scoped. */
async function resolveWorldContext(
  db: NonNullable<CommandContext["db"]>,
  worldId?: string,
): Promise<{ name: string; description?: string | null } | undefined> {
  if (!worldId || worldId === "default") { return undefined; }
  const row = await db
    .selectFrom("worlds",)
    .select(["name", "description",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  return row ? { name: row.name, description: row.description, } : undefined;
}

/**
 * Core `/create` logic: generate → quality gates → preview action.
 *
 * Extracted from the registered command so the LLM completion step is
 * injectable (the command passes the resolved provider's `complete`; tests pass
 * a stub). The entity is NEVER persisted here — the returned
 * `create-entity-preview` action carries the draft for user confirmation.
 */
export async function runCreateGeneration(
  args: string[],
  ctx: CommandContext,
  complete: (req: GenerateRequest,) => Promise<{ content: string }>,
  model = "",
): Promise<CommandResult> {
  const token = (args[0] || "").toLowerCase();
  const description = args.slice(1,).join(" ",).trim();

  if (!token || !VALID_ENTITY_TOKENS.includes(token,)) {
    return {
      systemMessage: "Usage: /create <char|loc|world|item> <description>",
      handled: true,
    };
  }
  if (!description) {
    return {
      systemMessage: `Usage: /create ${token} <description>`,
      handled: true,
    };
  }

  const { config, db, } = ctx;
  if (!db || !config) {
    return {
      systemMessage: "**Entity creation unavailable:** command context missing database/config.",
      handled: true,
    };
  }

  const kind = ENTITY_KIND_ALIASES[token] as EntityKind;

  try {
    const genReq: GenerateRequest = {
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a game master assistant. Generate structured entity data as valid JSON. Do not include markdown formatting or code blocks.",
        },
        { role: "user", content: resolveEntityGenerationPrompt(config, kind, description,), },
      ],
      params: { maxTokens: 512, temperature: 0.7, },
    };

    const result = await complete(genReq,);
    const content = result.content.trim();

    let raw: Record<string, unknown>;
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*\n?/, "",)
        .replace(/\n?```\s*$/, "",);
      const parsed = safeJsonParse<Record<string, unknown>>(cleaned,);
      if (!parsed.ok) { throw parsed.error; }
      raw = parsed.value;
    } catch {
      return {
        systemMessage: `**Failed to parse entity data from LLM response.**\n\nRaw output:\n${content.slice(0, 500,)}`,
        handled: true,
      };
    }

    const entity: GeneratedEntity = normalizeEntity(raw,);

    const worldId = ctx.activeChat?.worldId;
    const worldContext = await resolveWorldContext(db, worldId,);

    const report = await runQualityGates(
      db,
      kind,
      entity,
      { ownerId: ctx.userId ?? "", worldId, },
      worldContext,
    );

    if (!report.schema.ok) {
      return {
        systemMessage: `**Generation rejected — invalid ${kind} data:** ${report.schema.message}`,
        handled: true,
      };
    }

    // Schema passed: return a preview for user confirmation. The entity is not
    // persisted until the user approves via the confirm endpoint.
    const warnings: string[] = [];
    if (report.duplicate.found && report.duplicate.message) { warnings.push(report.duplicate.message,); }
    for (const w of report.consistency.warnings) {
      if (w) { warnings.push(w,); }
    }

    const summary = "**" + KIND_LABELS[kind] + " preview** — review before saving:\n\n" +
      "**Name:** " + entity.name + "\n" +
      (entity.description ? "**Description:** " + entity.description + "\n" : "") +
      (entity.personality ? "**Personality:** " + entity.personality + "\n" : "") +
      (entity.scenario ? "**Scenario:** " + entity.scenario + "\n" : "") +
      (entity.lore ? "**Lore:** " + entity.lore + "\n" : "") +
      (warnings.length > 0 ? "\n⚠️ " + warnings.join(" ",) : "");

    return {
      systemMessage: summary,
      action: "create-entity-preview",
      actionPayload: {
        kind,
        data: entity,
        description,
        worldId: worldId ?? null,
        userId: ctx.userId ?? null,
        warnings,
      },
      handled: true,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      systemMessage: `**Entity creation failed:** ${msg}`,
      handled: true,
    };
  }
}

registerCommand("create", async (args, ctx,): Promise<CommandResult> => {
  const { config, db, } = ctx;
  if (!db || !config) {
    return runCreateGeneration(args, ctx, async () => ({ content: "", }), "",);
  }
  const resolved = await resolveProvider({ config, userId: ctx.userId, db, },);
  return runCreateGeneration(args, ctx, (req,) => resolved.provider.complete(req,), resolved.resolvedModel,);
}, { requiredRole: ChatParticipantRole.Owner, },);
