// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/modify` — LLM-assisted modifications with quality gates (epic batch B4,
 * `epic-assistant-entity-access.md`).
 *
 * Preview-only: the command loads the entity, asks the model for the updated
 * fields, runs the `/create` quality pipeline (schema hard reject, duplicate
 * and consistency warnings) and returns a preview action the frontend
 * confirms before the real route is called. Nothing is persisted here.
 *
 * Route called on confirm (frontend `modify-entity` handler in
 * `src/frontend/alpine/chat-actions/entities.ts`):
 * - PUT /api/v1/worlds/:worldId                    (world patch)
 * - PUT /api/v1/worlds/:worldId/locations/:locId   (location patch)
 * - PUT /api/v1/worlds/:worldId/items/:itemId      (item patch)
 * - PUT /api/v1/actors/:actorId                    (character patch)
 */
import { ChatParticipantRole, } from "../../db/enums";
import { resolveProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, } from "../../generation/providers/types";
import { safeJsonParse, } from "../../utils";
import { type EntityKind, resolveEntityGenerationPrompt, } from "../prompt/templates/entity-generation";
import { normalizeEntity, runQualityGates, } from "../quality/entity-creation";
import { requireOwnedCharacter, requireOwnedWorldEntity, } from "./entity-guard";
import { formatPatch, validateJsonPatch, } from "./entity-patch";
import {
  CHARACTER_MODIFY_SPEC,
  ITEM_APPLY_SPEC,
  LOCATION_APPLY_SPEC,
  WORLD_APPLY_SPEC,
} from "./entity-patch-spec";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/** Kinds `/modify` accepts — the four entity families with an update route. */
const MODIFY_KINDS = ["character", "world", "location", "item",] as const;
type ModifyKind = (typeof MODIFY_KINDS)[number];

// ── /modify <kind> <id> <requested change> ───────────────────

/** The entity fields `/modify` reads and rewrites. */
interface CurrentEntity {
  name: string;
  description?: string;
  personality?: string;
  appearance?: string;
  scenario?: string;
}

/**
 * Render the current entity as the "before" half of the prompt.
 * @param current - the entity as stored
 * @returns prompt text naming the current fields
 */
function currentCard(current: CurrentEntity,): string {
  const lines = [`Current entity:`, `Name: ${current.name}`,];
  if (current.description) { lines.push(`Description: ${current.description}`,); }
  if (current.personality) { lines.push(`Personality: ${current.personality}`,); }
  if (current.appearance) { lines.push(`Appearance: ${current.appearance}`,); }
  if (current.scenario) { lines.push(`Scenario: ${current.scenario}`,); }

  return lines.join("\n",);
}

/**
 * Core `/modify` logic: load → LLM proposes fields → quality gates → preview.
 *
 * Extracted from the registered command so the LLM completion step is
 * injectable (the command passes the resolved provider's `complete`; tests
 * pass a stub) — the same seam `/create` uses. The entity is NEVER persisted
 * here: the returned `modify-entity` action carries the proposed patch for
 * user confirmation, and the frontend calls the same HTTP route `/apply` uses.
 * @param args - command arguments
 * @param ctx - command context
 * @param complete - LLM completion seam
 * @param model - resolved provider model
 * @returns the command result (preview action or rejection message)
 */
export async function runModifyGeneration(
  args: string[],
  ctx: CommandContext,
  complete: (req: GenerateRequest,) => Promise<{ content: string }>,
  model = "",
): Promise<CommandResult> {
  const kind = (args[0] || "").toLowerCase() as ModifyKind;
  const entityId = args[1] || "";
  const request = args.slice(2,).join(" ",).trim();

  if (!kind || !entityId || !request) {
    return {
      systemMessage: 'Usage: /modify <character|world|location|item> <id> "requested change"',
      handled: true,
    };
  }

  if (!MODIFY_KINDS.includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /modify supports: ${MODIFY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  const { config, db, } = ctx;
  if (!db) {
    return {
      systemMessage: "**Modification unavailable:** command context missing database.",
      handled: true,
    };
  }

  // Load the entity behind the route's own guard: characters are owned
  // (`actors.owner_id`, checked by `checkActorOwnership`), world-scoped
  // entities by their world's ownership.
  let current: CurrentEntity;
  let worldId: string | undefined;
  let contentVersion: number | undefined;
  if (kind === "character") {
    const owned = await requireOwnedCharacter(db, entityId, ctx.userId ?? null, ctx.userRole ?? null,);
    if (!owned.ok) { return { systemMessage: owned.message, handled: true, }; }
    current = owned.character;
    contentVersion = owned.character.contentVersion;
    worldId = ctx.activeChat?.worldId;
  } else {
    const owned = await requireOwnedWorldEntity(db, kind, entityId, ctx.userId ?? null, ctx.userRole ?? null,);
    if (!owned.ok) { return { systemMessage: owned.message, handled: true, }; }
    current = { name: owned.scope.name, description: owned.scope.description, };
    worldId = owned.scope.worldId;
  }

  // The prompt reuses the `/create` entity template: the current card plus the
  // requested change, so the model answers with the same entity shape the
  // quality gates validate.
  const prompt = resolveEntityGenerationPrompt(
    config,
    kind as EntityKind,
    `${currentCard(current,)}\n\nRequested change: ${request}\n\nReturn the complete updated entity.`,
  );

  const genReq: GenerateRequest = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a game master assistant. Update an existing entity as valid JSON. Do not include markdown formatting or code blocks.",
      },
      { role: "user", content: prompt, },
    ],
    params: { maxTokens: 512, temperature: 0.7, },
  };

  let raw: Record<string, unknown>;
  try {
    const content = (await complete(genReq,)).content.trim();
    const cleaned = content
      .replace(/^```(?:json)?\s*\n?/, "",)
      .replace(/\n?```\s*$/, "",);

    const parsed = safeJsonParse<Record<string, unknown>>(cleaned,);
    if (!parsed.ok) { throw parsed.error; }
    raw = parsed.value;
  } catch {
    // Never echo raw LLM output into the chat: every member can read
    // systemMessage, including those who could not invoke this command.
    return {
      systemMessage:
        `**Failed to parse ${kind} data from the model response.** Nothing was saved — retry with a simpler request.`,
      handled: true,
    };
  }

  const generated = normalizeEntity(raw,);
  // The model may omit a field; the stored value then wins, so a modification
  // never silently blanks a field the user did not ask to change.
  const merged: CurrentEntity = {
    name: generated.name || current.name,
    description: generated.description ?? current.description,
    personality: generated.personality ?? current.personality,
    appearance: generated.appearance ?? current.appearance,
    scenario: generated.scenario ?? current.scenario,
  };

  // The `/create` quality pipeline: schema validation is a hard reject, the
  // duplicate and consistency checks are warnings the user confirms past.
  const worldContext = kind === "character" ? undefined : await loadWorldContextFor(db, worldId,);
  const report = await runQualityGates(
    db,
    kind as EntityKind,
    merged,
    { ownerId: ctx.userId ?? "", worldId, },
    worldContext,
  );

  if (!report.schema.ok) {
    return {
      systemMessage: `**Modification rejected — invalid ${kind} data:** ${report.schema.message}`,
      handled: true,
    };
  }

  const updates: Record<string, unknown> = {};
  if (kind === "character") {
    if (merged.name !== current.name) { updates.displayName = merged.name; }
    if (merged.description && merged.description !== current.description) {
      updates.description = merged.description;
    }

    if (merged.personality && merged.personality !== current.personality) {
      updates.personality = merged.personality;
    }

    if (merged.appearance && merged.appearance !== current.appearance) {
      updates.appearance = merged.appearance;
    }
  } else {
    if (merged.name !== current.name) { updates.name = merged.name; }
    if (merged.description && merged.description !== current.description) {
      updates.description = merged.description;
    }
  }

  const spec = kind === "character"
    ? CHARACTER_MODIFY_SPEC
    : kind === "world"
    ? WORLD_APPLY_SPEC
    : kind === "location"
    ? LOCATION_APPLY_SPEC
    : ITEM_APPLY_SPEC;

  const validated = validateJsonPatch(updates, spec, kind,);
  if (!validated.ok) {
    return { systemMessage: `**Modification rejected:** ${validated.error}`, handled: true, };
  }

  if (Object.keys(validated.patch,).length === 0) {
    return {
      systemMessage:
        `**No changes proposed** for **${current.name}** [${entityId}] — the model returned the current values.`,
      handled: true,
    };
  }

  const warnings: string[] = [];
  // The duplicate gate matches the entity against ITSELF (same owner, same
  // name); that is not a duplicate, it is the row being modified.
  if (report.duplicate.found && report.duplicate.existingId !== entityId && report.duplicate.message) {
    warnings.push(report.duplicate.message,);
  }

  for (const warning of report.consistency.warnings) {
    if (warning) { warnings.push(warning,); }
  }

  return {
    systemMessage: [
      `**Modification preview** — **${current.name}** [${entityId}] will change:\n\n${formatPatch(validated.patch,)}`,
      warnings.length > 0 ? `**Warnings:**\n${warnings.map((w,) => `- ${w}`).join("\n",)}` : "",
      "Confirm in the dialog to apply.",
    ].filter(Boolean,).join("\n\n",),
    action: "modify-entity",
    actionPayload: {
      kind,
      entityId,
      worldId: worldId ?? null,
      name: current.name,
      updates: validated.patch,
      ...(contentVersion !== undefined ? { contentVersion, } : {}),
    },
    handled: true,
  };
}

/**
 * Load the active world context for the consistency gate.
 * @param db - database handle
 * @param worldId - world id
 * @returns the world context, or undefined when there is none
 */
async function loadWorldContextFor(
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

registerCommand("modify", async (args, ctx,): Promise<CommandResult> => {
  const { config, db, } = ctx;
  if (!db || !config) {
    return runModifyGeneration(args, ctx, async () => ({ content: "", }), "",);
  }

  try {
    const resolved = await resolveProvider({ config, userId: ctx.userId, db, },);
    return await runModifyGeneration(args, ctx, (req,) => resolved.provider.complete(req,), resolved.resolvedModel,);
  } catch {
    return {
      systemMessage: "**Modification failed.** Nothing was saved — the model provider is unavailable.",
      handled: true,
    };
  }
}, { requiredRole: ChatParticipantRole.Owner, },);
