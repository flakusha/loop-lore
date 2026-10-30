// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/clone` — duplicate an existing location/item (epic batch B4).
 *
 * Preview-only: the source row is read behind its route's own guard and the
 * copied fields travel in a preview action the frontend confirms before the
 * create route is called.
 */

import { ENTITY_ADAPTERS, } from "../adapter/adapters";
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
  // IS ownership of the target world — one guard covers both sides. The
  // adapter composes the same guards as the create routes (`requireWorldOwner`
  // for locations, `checkWorldOwnership` for items).
  const loaded = await ENTITY_ADAPTERS[kind as "location" | "item"].loadForCopy(
    db,
    sourceId,
    ctx.userId ?? null,
    ctx.userRole ?? null,
  );

  if (!loaded.ok) {
    return { systemMessage: loaded.message, handled: true, };
  }

  const { entity, } = loaded;
  const name = entity.name;
  const worldId = entity.worldId ?? "";
  const copied: EntityPatch = { ...entity.fields, name, };

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
  // The `(copy)` suffix is the default name; only an explicit `name=`
  // override replaces it (the copied `fields.name` is the SOURCE name now
  // that the adapter mapping carries it verbatim).
  const overrideName = typeof parsed.patch.name === "string" ? parsed.patch.name : undefined;
  const newName = overrideName ?? `${name} (copy)`;
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
}, { requiredRole: "member", capabilities: ["write-world",], },);
