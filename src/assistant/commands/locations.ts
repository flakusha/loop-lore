// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /loc-list, /loc-get — assistant read access to locations in a world.
 *
 * Both commands gate on `requireWorldAccess`, the same guard
 * `src/routes/worlds/locations.ts` applies to its own handlers.
 *
 * `/loc-update` (in this file, next to the reads it previews) gates on
 * `requireWorldOwner` — the mutation guard `handleUpdateLocation` applies —
 * and returns a preview action the frontend confirms before calling
 * `PUT /api/v1/worlds/:worldId/locations/:locId`.
 */

import { requireWorldAccess, requireWorldOwner, } from "../../routes/worlds/access";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
import { type CommandResult, registerCommand, } from "./registry";

/**
 * Update fields `/loc-update` accepts, keyed as the user writes them. They map
 * onto what `handleUpdateLocation` in `src/routes/worlds/locations.ts` reads
 * from the PUT body.
 */
const LOC_UPDATE_STRING_FIELDS = ["name", "description", "kind", "mobilityMode", "parentLocationId",] as const;
/** Numeric coordinate fields `/loc-update` accepts. */
const LOC_UPDATE_NUMBER_FIELDS = ["coordX", "coordY", "coordZ",] as const;

/**
 * One `key=value` pair parsed out of a `/loc-update` argument list.
 *
 * `connections` is special: its value is a JSON array of location-id strings
 * (e.g. `connections='["loc-1","loc-2"]'`), which is passed through to the
 * route's `validateConnections` check unchanged.
 */
export type LocationUpdatePatch = Partial<
  Record<
    | (typeof LOC_UPDATE_STRING_FIELDS | typeof LOC_UPDATE_NUMBER_FIELDS)[number]
    | "connections",
    string | number | string[]
  >
>;

export type ParseLocationUpdatesResult =
  | { ok: true; updates: LocationUpdatePatch }
  | { ok: false; error: string };

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

  const denied = await requireWorldAccess(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
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

/**
 * Parse `key=value` update pairs from the text after the location id. Values
 * may be quoted to include spaces; unquoted values end at whitespace. Tokens
 * that are not `key=value` pairs are ignored. A repeated key is LAST-WINS: the
 * final pair overwrites earlier ones in the returned patch (only the last
 * `connections` array survives, likewise for every other field).
 * @param input - raw argument text after the location id
 * @returns ok with the allowed-field patch, or an error describing the first bad pair
 */
export function parseLocationUpdates(input: string,): ParseLocationUpdatesResult {
  const pairRe = /([a-zA-Z]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  const updates: LocationUpdatePatch = {};
  let matched = false;

  for (const match of input.matchAll(pairRe,)) {
    matched = true;
    const key = match[1] ?? "";
    const value = match[3] ?? match[4] ?? match[5] ?? "";

    if ((LOC_UPDATE_STRING_FIELDS as readonly string[]).includes(key,)) {
      if (key === "parentLocationId" && value === "") {
        return {
          ok: false,
          error: 'Field "parentLocationId" expects a location id, got "".',
        };
      }

      updates[key as keyof LocationUpdatePatch] = value;
      continue;
    }

    if ((LOC_UPDATE_NUMBER_FIELDS as readonly string[]).includes(key,)) {
      const num = Number(value,);
      if (!Number.isFinite(num,)) {
        return { ok: false, error: `Field "${key}" expects a number, got "${value}".`, };
      }

      updates[key as keyof LocationUpdatePatch] = num;
      continue;
    }

    if (key === "connections") {
      const parsed = safeJsonParse<unknown>(value,);
      if (
        !parsed.ok ||
        !Array.isArray(parsed.value,) ||
        !parsed.value.every((id,): id is string => typeof id === "string")
      ) {
        return {
          ok: false,
          error: 'Field "connections" expects a JSON array of location ids, e.g. connections=\'["loc-1"]\'.',
        };
      }

      updates.connections = parsed.value;
      continue;
    }

    return {
      ok: false,
      error: `Unknown location field "${key}" — allowed: ${
        [...LOC_UPDATE_STRING_FIELDS, ...LOC_UPDATE_NUMBER_FIELDS, "connections",].join(", ",)
      }.`,
    };
  }

  if (!matched) {
    return {
      ok: false,
      error: 'No updates parsed — use key=value pairs, e.g. name="Rustic Tavern".',
    };
  }

  return { ok: true, updates, };
}

registerCommand("loc-update", async (args, ctx,): Promise<CommandResult> => {
  const locId = args[0];
  if (!locId) {
    return {
      systemMessage: 'Usage: /loc-update <loc-id> name="Rustic Tavern" description="…"',
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Locations unavailable:** command context missing database.", handled: true, };
  }

  // Authorization needs `world_id`, and `world_id` lives on the location row,
  // so the row is read before the owner check — the same read-first ordering
  // `/loc-get` uses. "Missing" and "not owned" produce byte-identical
  // messages so the id cannot be used as an existence oracle.
  const DENIED = `Location ${locId} not found or not owned by you.`;
  const loc = await db
    .selectFrom("locations",)
    .select(["id", "name", "world_id",],)
    .where("id", "=", locId,)
    .executeTakeFirst();

  if (!loc) {
    return { systemMessage: DENIED, handled: true, };
  }

  const denied = await requireWorldOwner(db, loc.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
  if (denied) {
    return { systemMessage: DENIED, handled: true, };
  }

  const parsed = parseLocationUpdates(args.slice(1,).join(" ",),);
  if (!parsed.ok) {
    return { systemMessage: `**Location update rejected:** ${parsed.error}`, handled: true, };
  }

  const changes = Object.entries(parsed.updates,)
    .map(([field, value,],) => {
      const serialized = Array.isArray(value,) ? safeJsonStringify(value,) : { ok: true, value, };
      return `- **${field}** → ${serialized.ok ? serialized.value : ""}`;
    },)
    .join("\n",);

  const effects: string[] = [];
  if (parsed.updates.parentLocationId !== undefined) {
    effects.push(
      `Reparents this location under **${parsed.updates.parentLocationId}** (depth and cycle checks apply).`,
    );
  }

  if (parsed.updates.connections !== undefined) {
    effects.push(
      "Replaces the travel connections; every id must belong to the same world.",
    );
  }

  if (Object.keys(parsed.updates,).some((k,) => k !== "parentLocationId" && k !== "connections")) {
    effects.push("Touches `updated_at` on the row.",);
  }

  return {
    systemMessage: [
      `**Update preview** — **${loc.name}** [${locId}] will change:\n\n${changes}`,
      effects.length > 0 ? `**Effects:**\n${effects.map((e,) => `- ${e}`).join("\n",)}` : "",
      "Confirm in the dialog to apply.",
    ].filter(Boolean,).join("\n\n",),
    action: "loc-update",
    actionPayload: { locId, worldId: loc.world_id, updates: parsed.updates, name: loc.name, },
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

  // DO NOT "FIX" THE ORDERING BELOW. Authorization needs `world_id`, and
  // `world_id` lives on this row — there is no other place it is recorded, so a
  // location outside a world-scoped chat cannot be authorized without reading
  // the row first. Confidentiality is therefore carried by the response wording
  // rather than by check ordering: "missing" and "not yours" produce byte-
  // identical messages, so the id cannot be used as an existence oracle, and the
  // projection above never reaches the caller unless the check below passes.
  // Moving the guard earlier would need a world argument this command does not
  // take; deleting it would remove the only access control on the row.
  if (!loc) {
    return { systemMessage: `Location ${locId} not found or access denied.`, handled: true, };
  }

  const denied = await requireWorldAccess(db, loc.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
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
