// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { WorldVisibility, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { forbidden, notFound, } from "../../validation/middleware";

/** Check world access; returns error Response if denied, null if OK.
 *
 * Single-server model (no federation, no per-channel ACLs): access is
 * owner | admin | world member | (public AND authenticated). SFW/NSFW gating
 * is orthogonal and handled by the existing canAccessNsfw chain. */
export async function requireWorldAccess(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Response | null> {
  const world = await database
    .selectFrom("worlds",)
    .select(["owner_id", "visibility",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return notFound("World not found",); }
  if (can(userRole, "admin.world",) || world.owner_id === userId) { return null; }
  if (!userId) { return notFound("World not found",); }
  // Public worlds are readable by any authenticated user.
  if (world.visibility === WorldVisibility.Public) { return null; }
  // Unlisted/private worlds: owner + world members (joined via invite) only.
  const member = await database
    .selectFrom("world_members",)
    .select("actor_id",)
    .where("world_id", "=", worldId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();
  if (member) { return null; }
  return notFound("World not found",);
}

/**
 * Check the caller OWNS the world (or is admin/solo) — for MUTATIONS.
 * Read access (public/member) is governed by requireWorldAccess.
 * @returns error Response if denied, null if OK.
 */
export async function requireWorldOwner(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Response | null> {
  const world = await database
    .selectFrom("worlds",)
    .select(["owner_id",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return notFound("World not found",); }
  if (can(userRole, "admin.world",) || world.owner_id === userId) { return null; }
  return forbidden("Forbidden",);
}
