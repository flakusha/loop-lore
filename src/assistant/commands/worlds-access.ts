// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /world-list, /world-get — assistant read access to worlds.
 *
 * `/world-list` mirrors the visibility rule `handleListWorlds` already applies
 * in `src/routes/worlds/worlds.ts`: a world is visible when the caller owns it,
 * when it is public, or when the caller is a member of it. `/world-get` gates
 * the detail read through `requireWorldAccess`, the guard the world routes use.
 */

import { WorldVisibility, } from "../../db/enums";
import { requireWorldAccess, } from "../../routes/worlds/access";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("world-list", async (_args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Worlds unavailable:** command context missing database.", handled: true, };
  }

  const userId = ctx.userId ?? null;
  const base = db
    .selectFrom("worlds",)
    .select(["id", "name", "kind", "visibility", "owner_id",],);

  // An unauthenticated caller sees public worlds only — `owner_id = NULL` would
  // never match in SQL, so the membership branch needs a real user id.
  const rows = userId
    ? await base
      .where((eb,) =>
        eb.or([
          eb("owner_id", "=", userId,),
          eb("visibility", "=", WorldVisibility.Public,),
          eb.exists(
            eb.selectFrom("world_members",)
              .select("world_id",)
              .whereRef("world_members.world_id", "=", "worlds.id",)
              .where("world_members.actor_id", "=", userId,),
          ),
        ],)
      )
      .orderBy("name", "asc",)
      .execute()
    : await base
      .where("visibility", "=", WorldVisibility.Public,)
      .orderBy("name", "asc",)
      .execute();

  if (rows.length === 0) {
    return { systemMessage: "No worlds found.", handled: true, };
  }

  const list = rows.map((w,) => {
    const tag = w.owner_id === userId ? " _(yours)_" : "";
    return `- **${w.name}** (${w.kind}, ${w.visibility})${tag} [${w.id}]`;
  },).join("\n",);

  return {
    systemMessage: `**Worlds (${rows.length}):**\n\n${list}`,
    action: "world-list",
    actionPayload: { worlds: rows, },
    handled: true,
  };
}, { requiredRole: "member", },);

registerCommand("world-get", async (args, ctx,): Promise<CommandResult> => {
  const worldId = args[0];
  if (!worldId) {
    return { systemMessage: "Usage: /world-get <world-id>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Worlds unavailable:** command context missing database.", handled: true, };
  }

  const denied = await requireWorldAccess(db, worldId, ctx.userId ?? null, null,);
  if (denied) {
    return { systemMessage: `World ${worldId} not found or access denied.`, handled: true, };
  }

  const world = await db.selectFrom("worlds",).selectAll().where("id", "=", worldId,).executeTakeFirst();
  if (!world) {
    return { systemMessage: `World ${worldId} not found or access denied.`, handled: true, };
  }

  const locations = await db
    .selectFrom("locations",)
    .select(["id", "name", "kind",],)
    .where("world_id", "=", worldId,)
    .orderBy("name", "asc",)
    .execute();

  const lore = await db
    .selectFrom("world_lore_entries",)
    .select(["id", "name",],)
    .where("world_id", "=", worldId,)
    .orderBy("name", "asc",)
    .execute();

  const locList = locations.length === 0
    ? "_none_"
    : locations.map((l,) => `- ${l.name} (${l.kind}) [${l.id}]`).join("\n",);

  const loreList = lore.length === 0
    ? "_none_"
    : lore.map((l,) => `- ${l.name ?? "(untitled)"} [${l.id}]`).join("\n",);

  return {
    systemMessage: [
      `**World:** ${world.name} [${world.id}]`,
      `**Kind:** ${world.kind} · **Visibility:** ${world.visibility} · **Difficulty:** ${world.difficulty_modifier}`,
      world.description ? `**Description:** ${world.description}` : "",
      world.lore ? `**Lore:** ${world.lore.slice(0, 500,)}${world.lore.length > 500 ? "…" : ""}` : "",
      `**Locations (${locations.length}):**\n${locList}`,
      `**Lore entries (${lore.length}):**\n${loreList}`,
    ].filter(Boolean,).join("\n",),
    action: "world-get",
    actionPayload: { world, locations, lore, },
    handled: true,
  };
}, { requiredRole: "member", },);
