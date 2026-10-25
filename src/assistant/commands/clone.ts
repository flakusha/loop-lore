// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/clone` — duplicate an existing location/item (epic batch B4).
 *
 * Preview-only: the source row is read behind its route's own guard and the
 * copied fields travel in a preview action the frontend confirms before the
 * create route is called.
 */

import { checkWorldOwnership, } from "../../routes/story-items/handlers";
import { requireWorldOwner, } from "../../routes/worlds/access";
import { safeJsonParse, } from "../../utils";
import { type EntityPatch, formatPatch, parseEntityPatch, } from "./entity-patch";
import { ITEM_ADD_SPEC, LOCATION_ADD_SPEC, } from "./entity-patch-spec";
import { type CommandResult, registerCommand, } from "./registry";

const NO_DB = (what: string,): CommandResult => ({
  systemMessage: `**${what} unavailable:** command context missing database.`,
  handled: true,
});

const ENTITY_KINDS = ["location", "item",] as const;

registerCommand("clone", async (args, ctx,): Promise<CommandResult> => {
  const [kind, sourceId,] = args;
  if (!kind || !sourceId) {
    return {
      systemMessage: 'Usage: /clone <location|item> <source-id> [name="Custom Copy"] [overrides …]',
      handled: true,
    };
  }

  if (!(ENTITY_KINDS as readonly string[]).includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /clone supports: ${ENTITY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return NO_DB(kind === "location" ? "Locations" : "Items",);
  }

  // A clone is created in the SOURCE's world, so ownership of the source row
  // IS ownership of the target world — one guard covers both sides. Same
  // guards as the create routes (`requireWorldOwner` for locations,
  // `checkWorldOwnership` for items).
  let name: string;
  let worldId: string;
  let copied: EntityPatch;
  if (kind === "location") {
    const DENIED = `Location ${sourceId} not found or not owned by you.`;
    const row = await db
      .selectFrom("locations",)
      .select([
        "id",
        "name",
        "world_id",
        "description",
        "kind",
        "mobility_mode",
        "coord_x",
        "coord_y",
        "coord_z",
        "connections",
      ],)
      .where("id", "=", sourceId,)
      .executeTakeFirst();

    if (!row) { return { systemMessage: DENIED, handled: true, }; }

    const err = await requireWorldOwner(db, row.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
    if (err) { return { systemMessage: DENIED, handled: true, }; }

    // parent_location_id is deliberately NOT copied: the clone must not
    // silently appear as a sibling in the source's tree position.
    const conn = safeJsonParse<unknown>(row.connections ?? "[]",);
    copied = {
      name: `${row.name} (copy)`,
      ...(row.description != null ? { description: row.description, } : {}),
      kind: row.kind,
      mobilityMode: row.mobility_mode,
      ...(row.coord_x !== null ? { coordX: row.coord_x, } : {}),
      ...(row.coord_y !== null ? { coordY: row.coord_y, } : {}),
      ...(row.coord_z !== null ? { coordZ: row.coord_z, } : {}),
      ...(conn.ok && Array.isArray(conn.value,)
        ? { connections: conn.value.filter((id,): id is string => typeof id === "string"), }
        : {}),
    };

    name = row.name;
    worldId = row.world_id;
  } else {
    const DENIED = `Item ${sourceId} not found or not owned by you.`;
    const row = await db
      .selectFrom("items",)
      .select(["id", "name", "world_id", "description", "category", "rarity", "value", "weight", "properties",],)
      .where("id", "=", sourceId,)
      .executeTakeFirst();

    if (!row) { return { systemMessage: DENIED, handled: true, }; }

    const owned = await checkWorldOwnership(db, row.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
    if (!owned) { return { systemMessage: DENIED, handled: true, }; }

    const props = safeJsonParse<Record<string, unknown>>(row.properties ?? "{}",);
    copied = {
      name: `${row.name} (copy)`,
      ...(row.description != null ? { description: row.description, } : {}),
      category: row.category,
      rarity: row.rarity,
      value: row.value,
      weight: row.weight,
      properties: props.ok && props.value && typeof props.value === "object" && !Array.isArray(props.value,)
        ? props.value
        : {},
    };

    name = row.name;
    worldId = row.world_id;
  }

  // Optional overrides: `name="…"` renames the copy; any other add-spec field
  // replaces the copied value. Last-wins via parseEntityPatch. Overrides are
  // OPTIONAL — an empty override list clones the source as-is, so an input
  // with no `key=value` pairs short-circuits instead of erroring.
  const spec = kind === "location"
    ? { ...LOCATION_ADD_SPEC, name: { type: "string" as const, }, }
    : { ...ITEM_ADD_SPEC, name: { type: "string" as const, }, };

  const rawOverrides = args.slice(2,).join(" ",);
  const parsed = rawOverrides.trim() === ""
    ? { ok: true as const, patch: {} as Record<string, never>, }
    : parseEntityPatch(rawOverrides, spec, kind,);

  if (!parsed.ok) {
    return { systemMessage: `**Clone rejected:** ${parsed.error}`, handled: true, };
  }

  const fields = { ...copied, ...parsed.patch, };
  const newName = (typeof fields.name === "string" ? fields.name : undefined) ?? `${name} (copy)`;
  fields.name = newName;

  const cloneNote = kind === "location"
    ? "Created without the source's `parentLocationId`."
    : "Created with route defaults for `stackable` / `maxStack`.";

  return {
    systemMessage: [
      `**Clone preview** — copy **${name}** [${sourceId}] as **${newName}**:\n\n${formatPatch(fields,)}`,
      cloneNote,
      "Confirm in the dialog to create the copy.",
    ].join("\n\n",),
    action: "clone-entity",
    actionPayload: { kind, sourceId, name: newName, worldId, fields, },
    handled: true,
  };
}, { requiredRole: "member", },);
