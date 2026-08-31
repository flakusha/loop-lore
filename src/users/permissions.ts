// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/users/permissions.ts — role → permission matrix + authorization helper
//
// Foundational RBAC infrastructure (TASK-user-seeding-role-expansion). Defines
// the permission vocabulary and the default matrix per role, plus `can()` /
// `hasAll()` helpers with wildcard support ("*", "chat.*").
//
// This matrix is the source of truth for role capabilities: route guards
// (admin areas, content ownership bypasses) call `can(role, perm)` rather than
// comparing raw roles. The ownership-bypass perms (`admin.character`,
// `admin.chat`, `admin.world`) are granted only to roles holding "*"
// (admin/solo/tester) — they let those roles operate on any user's content
// (owner check passes first, bypass is the admin override). Editing the matrix
// per role is how individual gate softening is configured.

import type { UserRole, } from "../db/enums";

/** */
export type Permission =
  | "chat.create"
  | "chat.join"
  | "chat.delete"
  | "character.create"
  | "character.view"
  | "character.edit_own"
  | "character.edit_any"
  | "character.delete_own"
  | "character.delete_any"
  | "world.create"
  | "world.view"
  | "world.edit_own"
  | "world.edit_any"
  | "world.delete_own"
  | "world.delete_any"
  | "user.view"
  | "user.edit"
  | "user.delete"
  | "user.ban"
  | "moderation.review"
  | "moderation.action"
  | "admin.settings"
  | "admin.users"
  | "admin.system"
  | "admin.character"
  | "admin.chat"
  | "admin.world"
  | "admin.audit.nsfw"
  | "export.own"
  | "export.any"
  | "import.own"
  | "import.any";

/** Default permission set per role. Wildcards allowed ("*" = all, "chat.*" = namespace). */
export const DEFAULT_PERMISSIONS: Record<UserRole, readonly string[]> = {
  admin: ["*",],
  moderator: ["chat.*", "character.view", "world.view", "moderation.*", "user.view", "user.ban",],
  user: [
    "chat.create",
    "chat.join",
    "character.create",
    "character.edit_own",
    "world.create",
    "world.edit_own",
    "export.own",
  ],
  creator: ["chat.*", "character.*", "world.*", "export.own", "import.own",],
  player: [
    "chat.create",
    "chat.join",
    "character.create",
    "character.edit_own",
    "world.create",
    "world.edit_own",
    "export.own",
  ],
  viewer: ["chat.join", "character.view", "world.view",],
  guest: ["chat.join", "character.view", "world.view",],
  bot: ["chat.join", "chat.create",],
  tester: ["*",],
  custom: [],
  solo: ["*",],
};

/**
 * Whether a permission string is granted by a role's permission set.
 * Supports wildcard namespaces: "chat.*" grants "chat.create"; "*" grants all.
 * @param role - User role (or null for anonymous)
 * @param permission - Permission to check, e.g. "character.edit_own"
 * @param overrides - Optional per-role override of DEFAULT_PERMISSIONS
 * @returns true if the role is granted the permission
 */
export function can(
  role: string | null | undefined,
  permission: string,
  overrides?: Record<string, readonly string[]>,
): boolean {
  if (!role) { return false; }
  const set = overrides?.[role] ?? DEFAULT_PERMISSIONS[role as UserRole];
  if (!set) { return false; }
  return set.some((p,): boolean => {
    if (p === "*" || p === permission) { return true; }
    if (p.endsWith(".*",)) {
      return permission.startsWith(p.slice(0, -1,),);
    }
    return false;
  },);
}

/**
 * Whether a role is granted every permission in a list.
 * @param role - User role
 * @param permissions - Permissions that must ALL be granted
 * @param overrides - Optional per-role override
 * @returns true if all permissions are granted
 */
export function hasAll(
  role: string | null | undefined,
  permissions: readonly string[],
  overrides?: Record<string, readonly string[]>,
): boolean {
  return permissions.every((p,) => can(role, p, overrides,));
}
