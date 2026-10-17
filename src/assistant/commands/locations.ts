// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /loc-list, /loc-get — assistant read access to locations in a world.
 *
 * Both commands gate on `requireWorldAccess`, the same guard
 * `src/routes/worlds/locations.ts` applies to its own handlers.
 */

import { requireWorldAccess, } from "../../routes/worlds/access";
import { safeJsonParse, } from "../../utils";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("loc-list", async (args, ctx,): Promise<CommandResult> => {
  const worldId = args[0] ?? ctx.activeChat?.worldId;
  if (!worldId) {
    return {
      systemMessage: "Usage: /loc-list [world-id] — pass a world-id when the chat has no world.",
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Locations unavailable:** command context missing database.", handled: true, };
  }

  const denied = await requireWorldAccess(db, worldId, ctx.userId ?? null, null,);
  if (denied) {
    return { systemMessage: `World ${worldId} not found or access denied.`, handled: true, };
  }

  const rows = await db
    .selectFrom("locations",)
    .select(["id", "name", "kind",],)
    .where("world_id", "=", worldId,)
    .orderBy("name", "asc",)
    .execute();

  if (rows.length === 0) {
    return { systemMessage: `No locations in world ${worldId}.`, handled: true, };
  }

  const list = rows.map((l,) => `- **${l.name}** (${l.kind}) [${l.id}]`).join("\n",);
  return {
    systemMessage: `**Locations (${rows.length}):**\n\n${list}`,
    action: "loc-list",
    actionPayload: { worldId, locations: rows, },
    handled: true,
  };
}, { requiredRole: "member", },);

registerCommand("loc-get", async (args, ctx,): Promise<CommandResult> => {
  const locId = args[0];
  if (!locId) {
    return { systemMessage: "Usage: /loc-get <loc-id>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Locations unavailable:** command context missing database.", handled: true, };
  }

  const loc = await db
    .selectFrom("locations",)
    .select([
      "id",
      "world_id",
      "name",
      "description",
      "kind",
      "mobility_mode",
      "parent_location_id",
      "coord_x",
      "coord_y",
      "coord_z",
      "connections",
    ],)
    .where("id", "=", locId,)
    .executeTakeFirst();

  // Same message for "no such location" and "no access": the caller must not be
  // able to probe which location ids exist in a world they cannot read.
  if (!loc) {
    return { systemMessage: `Location ${locId} not found or access denied.`, handled: true, };
  }

  const denied = await requireWorldAccess(db, loc.world_id, ctx.userId ?? null, null,);
  if (denied) {
    return { systemMessage: `Location ${locId} not found or access denied.`, handled: true, };
  }

  const parsed = safeJsonParse<unknown>(loc.connections,);
  const connIds = parsed.ok && Array.isArray(parsed.value,)
    ? parsed.value.filter((id,): id is string => typeof id === "string")
    : [];

  const connList = connIds.length === 0
    ? "_none_"
    : connIds.map((id,) => `- [${id}]`).join("\n",);

  const coords = [loc.coord_x, loc.coord_y, loc.coord_z,];
  const coordStr = coords.every((c,) => c === null)
    ? ""
    : `**Coords:** (${coords.map((c,) => c ?? 0).join(", ",)})`;

  return {
    systemMessage: [
      `**Location:** ${loc.name} [${loc.id}]`,
      `**World:** ${loc.world_id}`,
      `**Kind:** ${loc.kind} · **Mobility:** ${loc.mobility_mode}`,
      loc.parent_location_id ? `**Parent:** ${loc.parent_location_id}` : "",
      coordStr,
      loc.description ? `**Description:** ${loc.description}` : "",
      `**Connections (${connIds.length}):**\n${connList}`,
    ].filter(Boolean,).join("\n",),
    action: "loc-get",
    actionPayload: { location: loc, connections: connIds, },
    handled: true,
  };
}, { requiredRole: "member", },);
