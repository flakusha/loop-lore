// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { WorldVisibility, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { forbidden, notFound, } from "../../validation/middleware";

/** Options for {@link requireWorldAccess}. */
export interface WorldAccessOpts {
  /**
   * Admit the synthetic guest tier (no account, role `guest`) for PUBLIC
   * worlds. Only pass this on read-only routes: the guest tier holds no
   * account, so a mutating route routed through it would write
   * unauthenticated. With the flag off the guest tier never exists — the
   * derive yields a null role — so the guest branch stays unreachable.
   */
  allowGuest?: boolean;
}

/**
 * Check world access; returns error Response if denied, null if OK.
 *
 * Single-server model (no federation, no per-channel ACLs): access is
 * owner | admin | world member | (public AND authenticated). SFW/NSFW gating
 * is orthogonal and handled by the existing canAccessNsfw chain.
 * @param database
 * @param worldId
 * @param userId
 * @param userRole
 * @param opts
 * @returns {Promise<Response | null>}
 */
export async function requireWorldAccess(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
  opts?: WorldAccessOpts,
): Promise<Response | null> {
  const world = await database
    .selectFrom("worlds",)
    .select(["owner_id", "visibility",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  if (!world) { return notFound("World not found",); }
  if (can(userRole, "admin.world",) || world.owner_id === userId) { return null; }
  if (!userId) {
    // Guest tier: an account-less visitor on a guest-enabled READ route may
    // read PUBLIC worlds — and nothing else. Unlisted/private worlds stay
    // invisible, so a guest can never enumerate or write them.
    if (opts?.allowGuest && can(userRole, "world.view",) && world.visibility === WorldVisibility.Public) {
      return null;
    }

    return notFound("World not found",);
  }

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
 * @param database
 * @param worldId
 * @param userId
 * @param userRole
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
