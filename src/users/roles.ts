// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/users/roles.ts — role constants + helpers
//
// Consolidated user-role utilities (TASK-user-seeding-role-expansion). Central
// place for role validation, admin detection, and the authoritative role list,
// used by the seeding pipeline and available to route/middleware code.

import { UserRole, } from "../db/enums";

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
 *
 * @param role - Raw role string (e.g. from config or a DB row)
 * @returns true if the role is a known UserRole
 */
export function isValidRole(role: string | null | undefined,): role is UserRole {
  return role != null && ALL_ROLES.includes(role as UserRole,);
}

/**
 * Whether a role has admin-level privileges (full access).
 *
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
 *
 * @param role - user role
 * @returns true for admin, solo, or moderator roles
 */
export function isElevatedRole(role: string | null | undefined,): boolean {
  return role != null && ELEVATED_ROLES.includes(role as UserRole,);
}
