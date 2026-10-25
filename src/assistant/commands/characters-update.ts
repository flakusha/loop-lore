// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /char-update — assistant command to modify a character the caller owns.
 */

import { ActorType, } from "../../db/enums";
import { checkActorOwnership, } from "../../routes/actor-auth";
import {
  parseCharacterUpdates,
} from "./characters-access";
import { type CommandResult, registerCommand, } from "./registry";

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
}, { requiredRole: "member", },);
