// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/adapt <kind> <source-id> --to <target-world> [--fields f1,f2]` —
 * re-contextualize an entity for a new world (epic batch B5).
 *
 * The source is loaded through its adapter's ownership guard, the target
 * world's description/lore/lore-entries are loaded as context, the aux-style
 * provider proposes per-field changes (injectable completion seam, the same
 * pattern `/modify` uses), the `/create` quality gates validate the merged
 * draft, and the result travels in an `adapt-entity` preview action. The
 * adapted entity is persisted ONLY after the user confirms — as a NEW entity
 * in the target world via the create-entity confirm route.
 */

import { ChatParticipantRole, } from "../../db/enums";
import { resolveProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, } from "../../generation/providers/types";
import { jsonStringifyOr, } from "../../utils";
import { ENTITY_ADAPTERS, } from "../adapter/adapters";
import { ADAPT_ENTITY_KINDS, type AdaptEntityKind, } from "../adapter/entity";
import {
  ADAPTABLE_FIELDS,
  applyAdaptationChanges,
  buildAdaptationPrompt,
  type FieldChange,
  parseAdaptationChanges,
} from "../quality/adaptation";
import { normalizeEntity, runQualityGates, } from "../quality/entity-creation";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/**
 * Load the target world's context: name, description, lore, and lore-entry
 * contents (the deterministic half of the adaptation — no LLM).
 * @param db - database handle
 * @param worldId - target world
 * @returns the world name + flattened context text, or null when unknown
 */
async function loadTargetWorldContext(
  db: NonNullable<CommandContext["db"]>,
  worldId: string,
): Promise<{ name: string; context: string } | null> {
  const world = await db
    .selectFrom("worlds",)
    .select(["name", "description", "lore",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  if (!world) { return null; }

  const loreRows = await db
    .selectFrom("world_lore_entries",)
    .select(["name", "content",],)
    .where("world_id", "=", worldId,)
    .where("enabled", "=", "enabled",)
    .limit(10,)
    .execute();

  const context = [
    world.description ?? "",
    world.lore ?? "",
    ...loreRows.map((row,) => `${row.name ?? "Lore"}: ${row.content}`),
  ].filter((part,) => part !== "").join("\n",);

  return { name: world.name, context, };
}

/**
 * Core `/adapt` logic (LLM completion injectable for tests).
 * @param args - command arguments
 * @param ctx - command context
 * @param complete - LLM completion seam
 * @param model - resolved provider model
 * @returns the command result (preview action or rejection message)
 */
export async function runAdaptation(
  args: string[],
  ctx: CommandContext,
  complete: (req: GenerateRequest,) => Promise<{ content: string }>,
  model = "",
): Promise<CommandResult> {
  const [kind, sourceId,] = args;
  if (!kind || !sourceId) {
    return {
      systemMessage: "Usage: /adapt <character|location|item> <source-id> --to <world-id> [--fields f1,f2]",
      handled: true,
    };
  }

  if (!(ADAPT_ENTITY_KINDS as readonly string[]).includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /adapt supports: ${ADAPT_ENTITY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  const toIdx = args.indexOf("--to",);
  const targetWorldId = toIdx >= 0 ? args[toIdx + 1] ?? "" : "";
  if (!targetWorldId || targetWorldId.startsWith("--",)) {
    return { systemMessage: "**Adapt rejected:** a `--to <world-id>` target is required.", handled: true, };
  }

  const fieldsIdx = args.indexOf("--fields",);
  const requestedFields = fieldsIdx >= 0
    ? (args[fieldsIdx + 1] ?? "").split(",",).map((f,) => f.trim()).filter(Boolean,)
    : [];

  const allowed = ADAPTABLE_FIELDS[kind as AdaptEntityKind];
  const unknownFields = requestedFields.filter((f,) => !allowed.includes(f,));
  if (unknownFields.length > 0) {
    return {
      systemMessage: `**Adapt rejected:** ${kind} cannot adapt ${
        unknownFields.map((f,) => `\`${f}\``).join(", ",)
      } — adaptable fields: ${allowed.join(", ",)}.`,
      handled: true,
    };
  }

  const { db, userId, } = ctx;
  if (!db) {
    return { systemMessage: "**Adapt unavailable:** command context missing database.", handled: true, };
  }

  const target = await loadTargetWorldContext(db, targetWorldId,);
  if (!target) {
    return { systemMessage: `Target world ${targetWorldId} not found.`, handled: true, };
  }

  const loaded = await ENTITY_ADAPTERS[kind as AdaptEntityKind].loadForCopy(
    db,
    sourceId,
    userId ?? null,
    ctx.userRole ?? null,
  );

  if (!loaded.ok) {
    return { systemMessage: loaded.message, handled: true, };
  }

  const { entity, } = loaded;
  if (entity.worldId !== undefined && entity.worldId === targetWorldId) {
    return {
      systemMessage: "**Adapt rejected:** the source already lives in the target world — use `/duplicate` instead.",
      handled: true,
    };
  }

  let raw: string;
  try {
    raw = (
      await complete({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a game master assistant adapting an entity to a new world. Answer as valid JSON only. No markdown formatting.",
          },
          {
            role: "user",
            content: buildAdaptationPrompt({
              kind: kind as AdaptEntityKind,
              sourceName: entity.name,
              sourceFields: entity.fields,
              adaptFields: requestedFields,
              targetWorldName: target.name,
              targetWorldContext: target.context || "(no additional world context)",
            },),
          },
        ],
        params: { maxTokens: 512, temperature: 0.7, },
      },)
    ).content.trim();
  } catch {
    return {
      systemMessage: "**Adaptation failed.** Nothing was saved — the model provider is unavailable.",
      handled: true,
    };
  }

  const parsed = parseAdaptationChanges(raw, kind as AdaptEntityKind, requestedFields,);
  if (!parsed.ok) {
    return {
      systemMessage: `**Adaptation rejected:** ${parsed.error}. Nothing was saved.`,
      handled: true,
    };
  }

  // Fill oldValue from the loaded source so the preview shows before → after.
  const changes: FieldChange[] = parsed.changes.map((change,) => ({
    ...change,
    oldValue: typeof entity.fields[change.field] === "string"
      ? entity.fields[change.field] as string
      : null,
  }));

  const adaptedFields = applyAdaptationChanges(entity.fields, changes,);

  // The `/create` quality pipeline on the merged draft: schema validation is
  // a hard reject, duplicate/consistency stay advisory warnings.
  const report = await runQualityGates(
    db,
    kind as "character" | "location" | "item",
    normalizeEntity(adaptedFields,),
    { ownerId: userId ?? "", worldId: targetWorldId, },
    { name: target.name, description: target.context.slice(0, 200,), },
  );

  if (!report.schema.ok) {
    return {
      systemMessage: `**Adaptation rejected — invalid ${kind} data:** ${report.schema.message}`,
      handled: true,
    };
  }

  const warnings = [
    ...(report.duplicate.found && report.duplicate.message ? [report.duplicate.message,] : []),
    ...report.consistency.warnings.filter((w,) => w !== ""),
  ];

  const changeLines = changes.map((change,) =>
    `- \`${change.field}\`: ${change.oldValue === null ? "(empty)" : jsonStringifyOr(change.oldValue,)} → ${
      jsonStringifyOr(change.newValue,)
    } — ${change.reason}`
  );

  return {
    systemMessage: [
      `**Adaptation preview** — **${entity.name}** [${sourceId}] adapted for world **${target.name}** \`${targetWorldId}\`:`,
      "",
      ...changeLines,
      warnings.length > 0 ? `\n**Warnings:**\n${warnings.map((w,) => `- ${w}`).join("\n",)}` : "",
      "Confirm in the dialog to create the adapted entity in the target world.",
    ].join("\n",),
    action: "adapt-entity",
    actionPayload: {
      kind,
      sourceId,
      sourceName: entity.name,
      targetWorldId,
      fields: adaptedFields,
      changes,
    },
    handled: true,
  };
}

registerCommand("adapt", async (args, ctx,): Promise<CommandResult> => {
  const { config, db, } = ctx;
  if (!config) {
    return { systemMessage: "**Adapt unavailable:** command context missing config.", handled: true, };
  }

  try {
    const resolved = await resolveProvider({ config, userId: ctx.userId, db, },);
    return await runAdaptation(args, ctx, (req,) => resolved.provider.complete(req,), resolved.resolvedModel,);
  } catch {
    return {
      systemMessage: "**Adaptation failed.** Nothing was saved — the model provider is unavailable.",
      handled: true,
    };
  }
}, { requiredRole: ChatParticipantRole.Owner, },);
