// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ownership guards shared by the B4 entity commands.
 *
 * The guards are the ROUTES' own guards, reused verbatim — no new access
 * layer:
 * - world → `requireWorldOwner` (src/routes/worlds/access.ts)
 * - location → `requireWorldOwner` (the row's `world_id` is read first)
 * - item → `checkWorldOwnership` (src/routes/story-items/handlers.ts)
 * - character → `checkActorOwnership` (src/routes/actor-auth.ts)
 *
 * "Missing" and "not owned" produce byte-identical messages so an id cannot
 * be used as an existence oracle.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { checkActorOwnership, } from "../../routes/actor-auth";
import { checkWorldOwnership, } from "../../routes/story-items/handlers";
import { requireWorldOwner, } from "../../routes/worlds/access";

/** World-scoped entity kinds with an existing update route. */
export type WorldEntityKind = "world" | "location" | "item";

/** The scope an owned entity lives in. */
export interface EntityScope {
  name: string;
  description?: string;
  worldId: string;
}

export type EntityScopeResult =
  | { ok: true; scope: EntityScope }
  | { ok: false; message: string };

/** The fields `/modify` reads from a character row. */
export interface OwnedCharacter {
  name: string;
  description?: string;
  personality?: string;
  appearance?: string;
  scenario?: string;
  /** Optimistic-locking version the actor PUT route requires. */
  contentVersion: number;
}

export type OwnedCharacterResult =
  | { ok: true; character: OwnedCharacter }
  | { ok: false; message: string };

/**
 * Load a world-scoped entity behind its route's own guard.
 * @param db - database handle
 * @param kind - world / location / item
 * @param entityId - entity id
 * @param userId - authenticated caller
 * @param userRole - caller's site role (admin bypass)
 * @returns the entity scope, or a denial message
 */
export async function requireOwnedWorldEntity(
  db: Kysely<DB>,
  kind: WorldEntityKind,
  entityId: string,
  userId: string | null,
  userRole: string | null,
): Promise<EntityScopeResult> {
  if (kind === "world") {
    const denied = `World ${entityId} not found or not owned by you.`;
    const row = await db
      .selectFrom("worlds",)
      .select(["id", "name", "description",],)
      .where("id", "=", entityId,)
      .executeTakeFirst();

    if (!row) { return { ok: false, message: denied, }; }

    const err = await requireWorldOwner(db, entityId, userId, userRole,);
    if (err) { return { ok: false, message: denied, }; }

    return {
      ok: true,
      scope: { name: row.name, description: row.description ?? undefined, worldId: row.id, },
    };
  }

  if (kind === "location") {
    const denied = `Location ${entityId} not found or not owned by you.`;
    const row = await db
      .selectFrom("locations",)
      .select(["id", "name", "description", "world_id",],)
      .where("id", "=", entityId,)
      .executeTakeFirst();

    if (!row) { return { ok: false, message: denied, }; }

    const err = await requireWorldOwner(db, row.world_id, userId, userRole,);
    if (err) { return { ok: false, message: denied, }; }

    return {
      ok: true,
      scope: { name: row.name, description: row.description ?? undefined, worldId: row.world_id, },
    };
  }

  const denied = `Item ${entityId} not found or not owned by you.`;
  const row = await db
    .selectFrom("items",)
    .select(["id", "name", "description", "world_id",],)
    .where("id", "=", entityId,)
    .executeTakeFirst();

  if (!row) { return { ok: false, message: denied, }; }

  // The item-definition PUT route's own guard (`handleDefinition` in
  // src/routes/story-items/handlers.ts) is `checkWorldOwnership`.
  const owned = await checkWorldOwnership(db, row.world_id, userId, userRole,);
  if (!owned) { return { ok: false, message: denied, }; }

  return {
    ok: true,
    scope: { name: row.name, description: row.description ?? undefined, worldId: row.world_id, },
  };
}

/**
 * Check ownership of a world the caller wants to add entities to.
 * @param db - database handle
 * @param worldId - target world
 * @param kind - location (requireWorldOwner) / item (checkWorldOwnership)
 * @param userId - authenticated caller
 * @param userRole - caller's site role (admin bypass)
 * @returns ok, or a denial message
 */
export async function requireOwnedWorld(
  db: Kysely<DB>,
  worldId: string,
  kind: "location" | "item",
  userId: string | null,
  userRole: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const denied = `World ${worldId} not found or not owned by you.`;
  if (kind === "location") {
    const err = await requireWorldOwner(db, worldId, userId, userRole,);
    return err ? { ok: false, message: denied, } : { ok: true, };
  }

  const owned = await checkWorldOwnership(db, worldId, userId, userRole,);
  return owned ? { ok: true, } : { ok: false, message: denied, };
}

/**
 * Load a character behind the actor route's own ownership guard.
 * @param db - database handle
 * @param actorId - actor id
 * @param userId - authenticated caller
 * @param userRole - caller's site role (admin bypass)
 * @returns the character fields, or a denial message
 */
export async function requireOwnedCharacter(
  db: Kysely<DB>,
  actorId: string,
  userId: string | null,
  userRole: string | null,
): Promise<OwnedCharacterResult> {
  const denied = `Character ${actorId} not found or not owned by you.`;
  const row = await db
    .selectFrom("actors",)
    .select(["display_name", "description", "personality", "appearance", "scenario", "row_version",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!row) { return { ok: false, message: denied, }; }

  const owned = await checkActorOwnership(db, actorId, userId, userRole,);
  if (!owned) { return { ok: false, message: denied, }; }

  return {
    ok: true,
    character: {
      name: row.display_name,
      description: row.description ?? undefined,
      personality: row.personality ?? undefined,
      appearance: row.appearance ?? undefined,
      scenario: row.scenario ?? undefined,
      contentVersion: row.row_version,
    },
  };
}
