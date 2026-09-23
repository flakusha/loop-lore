// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/users/capabilities.ts — role × capability matrix for TASK-032.
//
// Companion to `permissions.ts` (machine-readable permission set) — this
// module is the human-readable, documentation-grade capability surface
// referenced by `bun run seed:users`, the admin UI, and the auth epic.
//
// Each capability is described in plain language and pinned to the
// permission string that gates it. New roles / capabilities land here
// first (matrix + description), then get wired into `permissions.ts`'s
// `DEFAULT_PERMISSIONS`. Keeping the two in sync is a release gate.

import { UserRole, } from "../db/enums-core/users";
import { type Permission, } from "./permissions";

/** A single human-readable capability description. */
export interface RoleCapability {
  /** Permission string from `src/users/permissions.ts`, a namespace wildcard
   *   ("chat.*"), or "*" for full access. */
  permission: Permission | "*" | "chat.*" | "character.*" | "world.*" | "moderation.*";
  /** Plain-language capability label (UI / docs). */
  label: string;
  /** Short description of what the capability grants. */
  description: string;
}

/**
 * Capability matrix across all UserRole values, mirroring
 * permissions.ts#DEFAULT_PERMISSIONS (TASK-032 acceptance).
 *
 * `admin`/`tester`/`solo` get `*`; `moderator` gets the moderation + chat
 * moderation set; `creator` gets full content authoring; `user`/`player`
 * get the authoring set; `viewer`/`guest` get the read-only public
 * surface; `custom` starts empty. The matrix is a documentation layer — actual enforcement
 * lives in `permissions.ts#DEFAULT_PERMISSIONS` and the middleware that
 * calls `can(role, permission)`.
 */
export const ROLE_CAPABILITIES: Record<UserRole, readonly RoleCapability[]> = {
  admin: [
    {
      permission: "*",
      label: "Full system access",
      description: "All permissions, including admin override on user content.",
    },
  ],
  moderator: [
    {
      permission: "moderation.review",
      label: "Review flags",
      description: "Open and adjudicate NSFW / content-flag reports.",
    },
    {
      permission: "moderation.action",
      label: "Take moderation actions",
      description: "Ban, kick, mute, or warn chat participants.",
    },
    { permission: "user.view", label: "View users", description: "Read user profiles and account metadata.", },
    { permission: "user.ban", label: "Ban users", description: "Suspend abusive accounts from the platform.", },
    { permission: "chat.*", label: "Chat moderation", description: "Inspect and moderate any chat on the platform.", },
    {
      permission: "character.view",
      label: "View characters",
      description: "Read any character card, including private.",
    },
    { permission: "world.view", label: "View worlds", description: "Read any world lorebook.", },
  ],
  creator: [
    { permission: "character.*", label: "Author characters", description: "Create, edit, and delete own characters.", },
    { permission: "world.*", label: "Author worlds", description: "Create, edit, and delete own worlds.", },
    { permission: "chat.*", label: "Run chats", description: "Open chats, send messages, manage chat participants.", },
    {
      permission: "export.own",
      label: "Export own content",
      description: "Download own characters / worlds as shareable cards.",
    },
    {
      permission: "import.own",
      label: "Import content",
      description: "Import character cards and lorebooks into own library.",
    },
  ],
  guest: [
    { permission: "chat.join", label: "Join public chats", description: "Spectate / participate in public rooms.", },
    { permission: "character.view", label: "View public characters", description: "Read public character cards.", },
    { permission: "world.view", label: "View public worlds", description: "Read public world lorebooks.", },
  ],
  user: [
    { permission: "chat.create", label: "Create chats", description: "Open new chats.", },
    { permission: "chat.join", label: "Join chats", description: "Participate in chats.", },
    { permission: "character.create", label: "Author characters", description: "Create character cards.", },
    { permission: "character.edit_own", label: "Edit own characters", description: "Edit own character cards.", },
    { permission: "world.create", label: "Author worlds", description: "Create world lorebooks.", },
    { permission: "world.edit_own", label: "Edit own worlds", description: "Edit own world lorebooks.", },
    {
      permission: "export.own",
      label: "Export own content",
      description: "Download own characters / worlds as shareable cards.",
    },
  ],
  player: [
    { permission: "chat.create", label: "Create chats", description: "Open new chats.", },
    { permission: "chat.join", label: "Join chats", description: "Participate in chats.", },
    { permission: "character.create", label: "Author characters", description: "Create character cards.", },
    { permission: "character.edit_own", label: "Edit own characters", description: "Edit own character cards.", },
    { permission: "world.create", label: "Author worlds", description: "Create world lorebooks.", },
    { permission: "world.edit_own", label: "Edit own worlds", description: "Edit own world lorebooks.", },
    {
      permission: "export.own",
      label: "Export own content",
      description: "Download own characters / worlds as shareable cards.",
    },
  ],
  viewer: [
    { permission: "chat.join", label: "Join chats", description: "Spectate / participate in chats.", },
    { permission: "character.view", label: "View characters", description: "Read character cards.", },
    { permission: "world.view", label: "View worlds", description: "Read world lorebooks.", },
  ],
  bot: [
    { permission: "chat.join", label: "Join chats", description: "Participate in chats as an automated actor.", },
    { permission: "chat.create", label: "Create chats", description: "Open chats as an automated actor.", },
  ],
  tester: [
    {
      permission: "*",
      label: "Full system access",
      description: "All permissions, including ownership bypass for testing.",
    },
  ],
  custom: [],
  solo: [
    {
      permission: "*",
      label: "Full system access",
      description: "Single-user mode grants all permissions, including ownership bypass.",
    },
  ],
};

/**
 * The four roles provisioned by `bun run seed:users` (TASK-032 acceptance).
 *
 * Order is intentional — display order in the admin role-picker, and the
 * order `ALL_ROLES` surfaces them. The seeded `id` matches the one in
 * `scripts/seed-users.ts`.
 */
export const SEEDED_ROLE_NAMES = ["admin", "moderator", "creator", "guest",] as const satisfies readonly UserRole[];

/**
 * Capabilities for a given role, or an empty list for unrecognised roles.
 * @param role
 */
export function capabilitiesForRole(role: UserRole | string,): readonly RoleCapability[] {
  if (role === UserRole.Admin) { return ROLE_CAPABILITIES.admin; }
  if (role === UserRole.Moderator) { return ROLE_CAPABILITIES.moderator; }
  if (role === UserRole.Creator) { return ROLE_CAPABILITIES.creator; }
  if (role === UserRole.Guest) { return ROLE_CAPABILITIES.guest; }
  return [];
}
