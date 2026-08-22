// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Boolean Flags (replacing integer 0/1) ───────────────
// ── State Machines ────────────────────────────────────────
import { createMachine, type StateDef, } from "../state";

export const PinnedState = {
  Unpinned: "unpinned",
  Pinned: "pinned",
  Archived: "archived",
} as const;
export type PinnedState = (typeof PinnedState)[keyof typeof PinnedState];

export const DefaultState = {
  NotDefault: "not_default",
  Default: "default",
} as const;
export type DefaultState = (typeof DefaultState)[keyof typeof DefaultState];

export const EquipState = {
  Unequipped: "unequipped",
  Equipped: "equipped",
} as const;
export type EquipState = (typeof EquipState)[keyof typeof EquipState];

export const StackableState = {
  Unique: "unique",
  Stackable: "stackable",
} as const;
export type StackableState = (typeof StackableState)[keyof typeof StackableState];

// ── Actor Keys ────────────────────────────────────────────
export const KeyType = {
  Signing: "signing",
  Encryption: "encryption",
  Symmetric: "symmetric",
  Master: "master",
  Primary: "primary",
} as const;
export type KeyType = (typeof KeyType)[keyof typeof KeyType];

export const KeyStatus = {
  Active: "active",
  Expired: "expired",
  Revoked: "revoked",
} as const;
export type KeyStatus = (typeof KeyStatus)[keyof typeof KeyStatus];

// ── Notes ─────────────────────────────────────────────────
export const NoteCategory = {
  General: "general",
  World: "world",
  Character: "character",
  Story: "story",
  Combat: "combat",
  Session: "session",
} as const;
export type NoteCategory = (typeof NoteCategory)[keyof typeof NoteCategory];

// ── Model Roles ───────────────────────────────────────────
export const ModelRole = {
  Main: "main",
  Auxiliary: "auxiliary",
  Captioning: "captioning",
  Moderation: "moderation",
  Embeddings: "embeddings",
  Summarization: "summarization",
} as const;
export type ModelRole = (typeof ModelRole)[keyof typeof ModelRole];

/**
 * Chat encryption tier — determines whether and how message content is
 * encrypted at rest.
 *
 * Valid values:
 *   - "none"      — plaintext, no crypto
 *   - "standard"  — server-mediated AES-256-GCM via stable chat keys
 *   - "at-rest"   — client-side E2E; server stores ciphertext as-is
 *                   and cannot decrypt (the messages.e2e_payload column).
 *
 * Note: `public` is NOT a valid EncryptionLevel value. Historically a
 * "public" sentinel appeared in the chats table default but was never a
 * valid tier. The `009_encryption_level_default` migration removes it.
 * Any code that encounters a `public` value should treat it as `none`.
 *
 * Migration history (TASK-asymmetric-key-pairs-followup Phase D):
 *   - The historical `"private"` value is renamed to `"at-rest"`. The
 *     `057_encryption_level_at_rest_rename` migration rewrites existing
 *     rows so live deployments roll forward cleanly.
 */
export const EncryptionLevel = {
  None: "none",
  Standard: "standard",
  AtRest: "at-rest",
} as const;
export type EncryptionLevel = (typeof EncryptionLevel)[keyof typeof EncryptionLevel];

// ── Plugin Lifecycle ─────────────────────────────────────
export const PluginStatus = {
  Active: "active",
  Disabled: "disabled",
  Error: "error",
} as const;
export type PluginStatus = (typeof PluginStatus)[keyof typeof PluginStatus];

// ── Notification Read State ──────────────────────────────
export const NotificationStatus = {
  Unread: "unread",
  Read: "read",
  Archived: "archived",
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

// ── Invite Lifecycle ─────────────────────────────────────
export const InviteStatus = {
  Active: "active",
  Revoked: "revoked",
  Expired: "expired",
  Exhausted: "exhausted",
} as const;
export type InviteStatus = (typeof InviteStatus)[keyof typeof InviteStatus];

const pluginStatusDef: StateDef<PluginStatus> = {
  values: ["active", "disabled", "error",] as const,
  initial: "active",
  transitions: {
    active: ["disabled", "error",],
    disabled: ["active", "error",],
    error: ["active", "disabled",],
  },
  terminal: [],
};
export const pluginStatusMachine = createMachine(pluginStatusDef,);

const notificationStatusDef: StateDef<NotificationStatus> = {
  values: ["unread", "read", "archived",] as const,
  initial: "unread",
  transitions: {
    unread: ["read", "archived",],
    read: ["unread", "archived",],
    archived: [],
  },
  terminal: ["archived",],
};
export const notificationStatusMachine = createMachine(notificationStatusDef,);

const inviteStatusDef: StateDef<InviteStatus> = {
  values: ["active", "revoked", "expired", "exhausted",] as const,
  initial: "active",
  transitions: {
    active: ["revoked", "expired", "exhausted",],
    revoked: [],
    expired: [],
    exhausted: [],
  },
  terminal: ["revoked", "expired", "exhausted",],
};
export const inviteStatusMachine = createMachine(inviteStatusDef,);
