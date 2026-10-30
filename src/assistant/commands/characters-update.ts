// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /char-update — assistant command to modify a character the caller owns, plus
 * the `key=value` parser for its arguments.
 */

import { ActorType, } from "../../db/enums";
import { checkActorOwnership, } from "../../routes/actor-auth";
import { type CommandResult, registerCommand, } from "./registry";

/**
 * String fields `/char-update` accepts, keyed exactly as the user writes them.
 * They map onto the camelCase body `buildActorUpdates`
 * (`src/routes/characters/update.ts`) reads from the `PUT /api/v1/actors/:actorId`
 * request.
 */
const CHAR_UPDATE_STRING_FIELDS = [
  "displayName",
  "description",
  "systemPrompt",
  "agentRole",
  "avatarAssetId",
  "contentRating",
  "personality",
  "appearance",
  "defaultOutfit",
  "welcomeMessage",
  "mesExample",
  "scenario",
  "postHistoryInstructions",
  "creatorNotes",
  "creator",
  "characterVersion",
  "growthMode",
] as const;

/** Numeric fields `/char-update` accepts. */
const CHAR_UPDATE_NUMBER_FIELDS = ["avatarFocusX", "avatarFocusY",] as const;
/** Boolean fields `/char-update` accepts. */
const CHAR_UPDATE_BOOLEAN_FIELDS = ["llmAssistEnabled",] as const;
/** Every accepted field, for unknown-field error messages. */
const ALL_CHAR_UPDATE_FIELDS = [
  ...CHAR_UPDATE_STRING_FIELDS,
  ...CHAR_UPDATE_NUMBER_FIELDS,
  ...CHAR_UPDATE_BOOLEAN_FIELDS,
] as const;

/**
 * One `key=value` pair parsed out of a `/char-update` argument list.
 */
export type CharacterUpdatePatch = Partial<
  Record<
    (typeof CHAR_UPDATE_STRING_FIELDS | typeof CHAR_UPDATE_NUMBER_FIELDS | typeof CHAR_UPDATE_BOOLEAN_FIELDS)[number],
    string | number | boolean
  >
>;

export type ParseCharacterUpdatesResult =
  | { ok: true; updates: CharacterUpdatePatch }
  | { ok: false; error: string };

/**
 * Parse `key=value` update pairs from the text after the character id. Values
 * may be quoted to include spaces; unquoted values end at whitespace. Tokens
 * that are not `key=value` pairs are ignored. A repeated key is LAST-WINS: the
 * final pair overwrites earlier ones in the returned patch.
 * @param input - raw argument text after the character id
 * @returns ok with the allowed-field patch, or an error describing the first bad pair
 */
export function parseCharacterUpdates(input: string,): ParseCharacterUpdatesResult {
  const pairRe = /([a-zA-Z]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  const updates: CharacterUpdatePatch = {};
  let matched = false;

  for (const match of input.matchAll(pairRe,)) {
    matched = true;
    const key = match[1] ?? "";
    const value = match[3] ?? match[4] ?? match[5] ?? "";

    if ((CHAR_UPDATE_STRING_FIELDS as readonly string[]).includes(key,)) {
      updates[key as keyof CharacterUpdatePatch] = value;
      continue;
    }

    if ((CHAR_UPDATE_NUMBER_FIELDS as readonly string[]).includes(key,)) {
      const num = Number(value,);
      if (!Number.isFinite(num,)) {
        return { ok: false, error: `Field "${key}" expects a number, got "${value}".`, };
      }

      updates[key as keyof CharacterUpdatePatch] = num;
      continue;
    }

    if ((CHAR_UPDATE_BOOLEAN_FIELDS as readonly string[]).includes(key,)) {
      if (value !== "true" && value !== "false") {
        return { ok: false, error: `Field "${key}" expects true or false, got "${value}".`, };
      }

      updates[key as keyof CharacterUpdatePatch] = value === "true";
      continue;
    }

    return {
      ok: false,
      error: `Unknown character field "${key}" — allowed: ${ALL_CHAR_UPDATE_FIELDS.join(", ",)}.`,
    };
  }

  if (!matched) {
    return {
      ok: false,
      error: 'No updates parsed — use key=value pairs, e.g. displayName="Iria the Bold".',
    };
  }

  return { ok: true, updates, };
}

registerCommand("char-update", async (args, ctx,): Promise<CommandResult> => {
  const charId = args[0];
  if (!charId) {
    return {
      systemMessage: 'Usage: /char-update <char-id> displayName="Iria the Bold" personality="…"',
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Characters unavailable:** command context missing database.", handled: true, };
  }

  // Authorization reuses the route guard `checkActorOwnership`
  // (src/routes/actor-auth.ts), which the `PUT /api/v1/actors/:actorId`
  // handler applies. Like `/loc-update`, the row is read before the owner
  // check because `row_version` (required by the route's optimistic locking)
  // and `display_name` live on it. Unlike the `/char-get` WHERE-clause
  // narrowing, this command deliberately inherits the route's full
  // `admin.character` branch so an admin assistant confirms the same rows the
  // admin could edit through the UI. "Missing" and "not owned" produce
  // byte-identical messages so the id cannot be used as an existence oracle.
  const DENIED = `Character ${charId} not found or access denied.`;
  const actor = await db
    .selectFrom("actors",)
    .select(["id", "display_name", "row_version",],)
    .where("id", "=", charId,)
    .where("actor_type", "=", ActorType.Character,)
    .executeTakeFirst();

  if (!actor) {
    return { systemMessage: DENIED, handled: true, };
  }

  const owned = await checkActorOwnership(db, charId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (!owned) {
    return { systemMessage: DENIED, handled: true, };
  }

  const parsed = parseCharacterUpdates(args.slice(1,).join(" ",),);
  if (!parsed.ok) {
    return { systemMessage: `**Character update rejected:** ${parsed.error}`, handled: true, };
  }

  const changes = Object.entries(parsed.updates,)
    .map(([field, value,],) => `- **${field}** → ${String(value,)}`)
    .join("\n",);

  return {
    systemMessage: [
      `**Update preview** — **${actor.display_name}** [${charId}] will change:\n\n${changes}`,
      `The save is version-checked against content version **${actor.row_version}**; a concurrent edit rejects the write instead of overwriting it.`,
      "Confirm in the dialog to apply.",
    ].join("\n\n",),
    action: "char-update",
    actionPayload: {
      charId,
      name: actor.display_name,
      updates: parsed.updates,
      contentVersion: actor.row_version,
    },
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["write-character", "cross-user",], },);
