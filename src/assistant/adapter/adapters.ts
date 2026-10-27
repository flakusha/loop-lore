// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-kind entity adapters composing the existing access guards and services
 * (`src/routes/worlds/access`, `src/routes/story-items/handlers`, actor
 * ownership) with the copiable-field mapping the duplication/adaptation
 * commands need. Locations/items are created without the source's tree
 * position / route-defaulted fields, mirroring `/clone`.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { checkWorldOwnership, } from "../../routes/story-items/handlers";
import { requireWorldOwner, } from "../../routes/worlds/access";
import { safeJsonParse, } from "../../utils";
import { requireOwnedCharacter, } from "../commands/entity-guard";
import {
  type DuplicateEntityKind,
  type EntityAdapter,
  type LoadedEntityResult,
} from "./entity";

/** Denial message template shared by every guard branch. */
const denied = (what: string, id: string,): string => `${what} ${id} not found or not owned by you.`;

/** The character adapter: loads through the actor route's ownership guard. */
const characterAdapter: EntityAdapter = {
  kind: "character",
  async loadForCopy(db, id, userId, userRole,): Promise<LoadedEntityResult> {
    const owned = await requireOwnedCharacter(db, id, userId, userRole,);
    if (!owned.ok) { return { ok: false, message: denied("Character", id,), }; }

    const c = owned.character;
    return {
      ok: true,
      entity: {
        name: c.name,
        fields: {
          name: c.name,
          ...(c.description ? { description: c.description, } : {}),
          ...(c.personality ? { personality: c.personality, } : {}),
          ...(c.appearance ? { appearance: c.appearance, } : {}),
          ...(c.scenario ? { scenario: c.scenario, } : {}),
        },
      },
    };
  },
};

/** The world adapter: copies the lore-bearing fields only. */
const worldAdapter: EntityAdapter = {
  kind: "world",
  async loadForCopy(db, id, userId, userRole,): Promise<LoadedEntityResult> {
    const row = await db
      .selectFrom("worlds",)
      .select(["name", "description", "lore",],)
      .where("id", "=", id,)
      .executeTakeFirst();

    if (!row) { return { ok: false, message: denied("World", id,), }; }

    const err = await requireWorldOwner(db, id, userId, userRole,);
    if (err) { return { ok: false, message: denied("World", id,), }; }

    return {
      ok: true,
      entity: {
        name: row.name,
        fields: {
          name: row.name,
          ...(row.description != null ? { description: row.description, } : {}),
          ...(row.lore != null ? { lore: row.lore, } : {}),
        },
        note: "Created without the source's members, difficulty, and RPG settings.",
      },
    };
  },
};

/** The location adapter: `/clone`'s copy mapping, moved here for reuse. */
const locationAdapter: EntityAdapter = {
  kind: "location",
  async loadForCopy(db, id, userId, userRole,): Promise<LoadedEntityResult> {
    const row = await db
      .selectFrom("locations",)
      .select([
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
      .where("id", "=", id,)
      .executeTakeFirst();

    if (!row) { return { ok: false, message: denied("Location", id,), }; }

    const err = await requireWorldOwner(db, row.world_id, userId, userRole,);
    if (err) { return { ok: false, message: denied("Location", id,), }; }

    // parent_location_id is deliberately NOT copied: the copy must not
    // silently appear as a sibling in the source's tree position.
    const conn = safeJsonParse<unknown>(row.connections ?? "[]",);
    return {
      ok: true,
      entity: {
        name: row.name,
        worldId: row.world_id,
        fields: {
          name: row.name,
          ...(row.description != null ? { description: row.description, } : {}),
          kind: row.kind,
          mobilityMode: row.mobility_mode,
          ...(row.coord_x !== null ? { coordX: row.coord_x, } : {}),
          ...(row.coord_y !== null ? { coordY: row.coord_y, } : {}),
          ...(row.coord_z !== null ? { coordZ: row.coord_z, } : {}),
          ...(conn.ok && Array.isArray(conn.value,)
            ? { connections: conn.value.filter((v,): v is string => typeof v === "string"), }
            : {}),
        },
        note: "Created without the source's `parentLocationId`.",
      },
    };
  },
};

/** The item adapter: definition fields only, route defaults for stacking. */
const itemAdapter: EntityAdapter = {
  kind: "item",
  async loadForCopy(db, id, userId, userRole,): Promise<LoadedEntityResult> {
    const row = await db
      .selectFrom("items",)
      .select(["name", "world_id", "description", "category", "rarity", "value", "weight", "properties",],)
      .where("id", "=", id,)
      .executeTakeFirst();

    if (!row) { return { ok: false, message: denied("Item", id,), }; }

    const owned = await checkWorldOwnership(db, row.world_id, userId, userRole,);
    if (!owned) { return { ok: false, message: denied("Item", id,), }; }

    const props = safeJsonParse<Record<string, unknown>>(row.properties ?? "{}",);
    return {
      ok: true,
      entity: {
        name: row.name,
        worldId: row.world_id,
        fields: {
          name: row.name,
          ...(row.description != null ? { description: row.description, } : {}),
          category: row.category,
          rarity: row.rarity,
          value: row.value,
          weight: row.weight,
          properties: props.ok && props.value && typeof props.value === "object" && !Array.isArray(props.value,)
            ? props.value
            : {},
        },
        note: "Created with route defaults for `stackable` / `maxStack`.",
      },
    };
  },
};

/** All duplicate/adapt-capable adapters, keyed by kind. */
export const ENTITY_ADAPTERS: Readonly<Record<DuplicateEntityKind, EntityAdapter>> = {
  character: characterAdapter,
  world: worldAdapter,
  location: locationAdapter,
  item: itemAdapter,
};
