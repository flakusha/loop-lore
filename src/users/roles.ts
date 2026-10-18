// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/users/roles.ts — role constants + helpers
//
// Consolidated user-role utilities (TASK-user-seeding-role-expansion). Central
// place for role validation, admin detection, and the authoritative role list,
// used by the seeding pipeline and available to route/middleware code.

import type { Kysely, } from "kysely";
import { UserRole, UserStatus, } from "../db/enums";
import type { DB, } from "../db/schema";

/** All assignable user roles in display order (admin → least privileged). */
export const ALL_ROLES: readonly UserRole[] = [
  UserRole.Admin,
  UserRole.Moderator,
  UserRole.Creator,
  UserRole.Player,
  UserRole.User,
  UserRole.Viewer,
  UserRole.Guest,
  UserRole.Bot,
  UserRole.Tester,
  UserRole.Custom,
  UserRole.Solo,
];

/** Roles that confer full system access (equivalent to admin). */
export const ADMIN_ROLES: readonly UserRole[] = [UserRole.Admin, UserRole.Solo,];

/**
 * Whether a role string is a valid UserRole.
 * @param role - Raw role string (e.g. from config or a DB row)
 * @returns true if the role is a known UserRole
 */
export function isValidRole(role: string | null | undefined,): role is UserRole {
  return role != null && ALL_ROLES.includes(role as UserRole,);
}

/**
 * Whether a role has admin-level privileges (full access).
 * @param role - user role or null for anonymous
 * @returns true for admin and solo roles
 */
export function isAdminRole(role: string | null | undefined,): boolean {
  return role === UserRole.Admin || role === UserRole.Solo;
}

/** Roles that confer moderation powers (admin, solo, or moderator). */
export const ELEVATED_ROLES: readonly UserRole[] = [
  UserRole.Admin,
  UserRole.Solo,
  UserRole.Moderator,
];

/**
 * Whether a role is an elevated moderation role (admin or moderator).
 * Moderators have user-moderation powers but not full admin.
 * @param role - user role
 * @returns true for admin, solo, or moderator roles
 */
export function isElevatedRole(role: string | null | undefined,): boolean {
  return role != null && ELEVATED_ROLES.includes(role as UserRole,);
}

/**
 * Resolve a caller's site role from the database, the way the HTTP layer does.
 *
 * Mirrors `verifyTokenContext` (`src/middleware/auth/authenticate.ts:97-106`):
 * the live `users.role` column, NOT the JWT `role` claim, so a demotion takes
 * effect on the next call rather than when the token expires. A missing row, a
 * disabled/deactivated account, or an anonymous caller resolves to `null` —
 * which every `can()` consumer treats as "no permissions", so an unresolved
 * role is always the least-privileged answer.
 *
 * This only *resolves* the role; it does not decide anything with it. Callers
 * hand the result to the same `can(userRole, "admin.world")` branch the world
 * routes use, so the command and HTTP paths cannot drift apart.
 * @param db - Database handle
 * @param userId - Caller id, or null/undefined for an anonymous caller
 * @returns The user's `users.role`, or null when it cannot be resolved
 */
export async function resolveUserRole(
  db: Kysely<DB>,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) { return null; }

  const user = await db
    .selectFrom("users",)
    .select(["role", "status",],)
    .where("id", "=", userId,)
    .executeTakeFirst();

  if (!user || user.status === UserStatus.Disabled || user.status === UserStatus.Deactivated) {
    return null;
  }

  return user.role;
}
