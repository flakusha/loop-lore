// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /world-update, /world-delete — assistant mutation access to worlds.
 *
 * Neither command persists anything here: both validate with
 * `requireWorldOwner` (the mutation guard `handleUpdateWorld`/
 * `handleDeleteWorld` in `src/routes/worlds/worlds*.ts` apply) and return a
 * preview action the frontend confirms before calling
 * `PUT`/`DELETE /api/worlds/:worldId` — the same confirm-dialog flow `/link`
 * uses for `link-asset`.
 */

import { WorldKind, WorldVisibility, } from "../../db/enums";
import { requireWorldOwner, } from "../../routes/worlds/access";
import { type CommandResult, registerCommand, } from "./registry";

/** World fields `/world-update` accepts, keyed as the user writes them. */
const WORLD_UPDATE_STRING_FIELDS = ["name", "description", "lore", "kind", "visibility",] as const;
/** Numeric world fields `/world-update` accepts. */
const WORLD_UPDATE_NUMBER_FIELDS = ["scanDepth", "tokenBudget", "difficultyModifier",] as const;
/**
 * String fields whose value must match a known literal — the route rejects
 * anything else with 422, so the preview must not promise a change the API
 * refuses (mirrors `WorldUpdateBody` in `src/validation/schemas/worlds.ts`).
 */
const WORLD_UPDATE_ENUMS: Record<string, readonly string[]> = {
  visibility: Object.values(WorldVisibility,),
  kind: Object.values(WorldKind,),
};

/** One `key=value` pair parsed out of a `/world-update` argument list. */
export type WorldUpdatePatch = Partial<
  Record<(typeof WORLD_UPDATE_STRING_FIELDS | typeof WORLD_UPDATE_NUMBER_FIELDS)[number], string | number>
>;

export type ParseWorldUpdatesResult =
  | { ok: true; updates: WorldUpdatePatch }
  | { ok: false; error: string };

/**
 * Parse `key=value` update pairs from the text after the world id. Values may
 * be quoted to include spaces; unquoted values end at whitespace. Tokens that
 * are not `key=value` pairs are ignored; a repeated key is last-wins (the
 * final pair overwrites earlier ones in the returned patch).
 * @param input - raw argument text after the world id
 * @returns ok with the allowed-field patch, or an error describing the first bad pair
 */
export function parseWorldUpdates(input: string,): ParseWorldUpdatesResult {
  const pairRe = /([a-zA-Z]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  const updates: WorldUpdatePatch = {};
  let matched = false;

  for (const match of input.matchAll(pairRe,)) {
    matched = true;
    const key = match[1] ?? "";
    const value = match[3] ?? match[4] ?? match[5] ?? "";

    if ((WORLD_UPDATE_STRING_FIELDS as readonly string[]).includes(key,)) {
      const allowed = WORLD_UPDATE_ENUMS[key];
      if (allowed && !allowed.includes(value,)) {
        return {
          ok: false,
          error: `Invalid ${key} "${value}" — expected one of: ${allowed.join(", ",)}.`,
        };
      }

      // The route's `Name` schema accepts 1-255 characters and rejects the
      // rest with 422 — a preview must not promise a change the API refuses.
      if (key === "name" && (value.length < 1 || value.length > 255)) {
        return {
          ok: false,
          error: `Field "name" must be 1-255 characters, got ${value.length}.`,
        };
      }

      updates[key as keyof WorldUpdatePatch] = value;
      continue;
    }

    if ((WORLD_UPDATE_NUMBER_FIELDS as readonly string[]).includes(key,)) {
      const num = Number(value,);
      if (!Number.isFinite(num,)) {
        return { ok: false, error: `Field "${key}" expects a number, got "${value}".`, };
      }

      updates[key as keyof WorldUpdatePatch] = num;
      continue;
    }

    return {
      ok: false,
      error: `Unknown world field "${key}" — allowed: ${
        [...WORLD_UPDATE_STRING_FIELDS, ...WORLD_UPDATE_NUMBER_FIELDS,].join(", ",)
      }.`,
    };
  }

  if (!matched) {
    return {
      ok: false,
      error: 'No updates parsed — use key=value pairs, e.g. description="A colder world".',
    };
  }

  return { ok: true, updates, };
}

registerCommand("world-update", async (args, ctx,): Promise<CommandResult> => {
  const worldId = args[0];
  if (!worldId) {
    return {
      systemMessage: 'Usage: /world-update <world-id> name="New name" description="…"',
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Worlds unavailable:** command context missing database.", handled: true, };
  }

  const denied = await requireWorldOwner(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (denied) {
    return { systemMessage: `World ${worldId} not found or not owned by you.`, handled: true, };
  }

  const parsed = parseWorldUpdates(args.slice(1,).join(" ",),);
  if (!parsed.ok) {
    return { systemMessage: `**World update rejected:** ${parsed.error}`, handled: true, };
  }

  const world = await db
    .selectFrom("worlds",)
    .select("name",)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  if (!world) {
    return { systemMessage: `World ${worldId} not found or not owned by you.`, handled: true, };
  }

  const changes = Object.entries(parsed.updates,)
    .map(([field, value,],) => `- **${field}** → ${value}`)
    .join("\n",);

  return {
    systemMessage:
      `**Update preview** — **${world.name}** [${worldId}] will change:\n\n${changes}\n\nConfirm in the dialog to apply.`,
    action: "world-update",
    actionPayload: { worldId, updates: parsed.updates, },
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["write-world", "cross-user",], },);

registerCommand("world-delete", async (args, ctx,): Promise<CommandResult> => {
  const worldId = args[0];
  if (!worldId) {
    return { systemMessage: "Usage: /world-delete <world-id>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Worlds unavailable:** command context missing database.", handled: true, };
  }

  const denied = await requireWorldOwner(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (denied) {
    return { systemMessage: `World ${worldId} not found or not owned by you.`, handled: true, };
  }

  const world = await db
    .selectFrom("worlds",)
    .select("name",)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  if (!world) {
    return { systemMessage: `World ${worldId} not found or not owned by you.`, handled: true, };
  }

  const count = async (table: "locations" | "world_lore_entries" | "quests" | "items",): Promise<number> =>
    (await db.selectFrom(table,).select("id",).where("world_id", "=", worldId,).execute()).length;

  const cascade = {
    locations: await count("locations",),
    loreEntries: await count("world_lore_entries",),
    quests: await count("quests",),
    items: await count("items",),
  };

  const cascadeNote = Object.entries(cascade,)
    .filter(([, n,],) => n > 0)
    .map(([kind, n,],) => `- ${n} ${kind}`)
    .join("\n",);

  return {
    systemMessage: [
      `**Delete preview** — **${world.name}** [${worldId}] will be removed permanently.`,
      cascadeNote ? `**Cascade:**\n${cascadeNote}` : "No locations, lore, quests, or items are attached.",
      "Chats bound to this world or its locations stay, but lose their world/location binding.",
      "Confirm in the dialog to delete.",
    ].join("\n\n",),
    action: "world-delete",
    actionPayload: { worldId, cascade, },
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["delete-world", "irreversible", "destructive", "cross-user",], },);
