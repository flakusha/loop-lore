// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** NSFW-specific moderation action types */
export type NsfwModerationActionType =
  | "nsfw_block" // Block user from NSFW interactions
  | "nsfw_ban" // Ban user from NSFW content entirely
  | "nsfw_shadow" // Shadow NSFW messages for specific viewers
  | "nsfw_collapse" // Collapse NSFW content in group chats
  | "nsfw_override"; // Admin emergency NSFW content removal

/** NSFW moderation scope — per-chat, per-user, or per-world */
export type NsfwModerationScope = "chat" | "user" | "world" | "global";

/** An NSFW-specific moderation action */
export interface NsfwModerationAction {
  type: NsfwModerationActionType;
  /** Who/what is being moderated */
  targetActorId: string;
  /** Scope of the NSFW moderation */
  scope: NsfwModerationScope;
  /** Entity ID for scoped actions (chat_id, world_id, etc.) */
  scopeEntityId?: string;
  /** Who applied the moderation */
  actorId: string;
  /** Reason for the moderation */
  reason?: string;
  /** Whether this is internal (mod queue) or external (user report) */
  internal: boolean;
  /** When this action was applied */
  timestamp: Date;
  /** When this action expires (if temporary) */
  expires_at?: Date;
}

/** Status of a flagged NSFW content item */
export type NsfwFlagStatus = "pending" | "reviewing" | "resolved" | "dismissed";

/** Resolution action taken on a flagged item */
export type NsfwFlagResolution =
  | "content_removed"
  | "content_warned"
  | "content_allowed"
  | "false_report"
  | "escalated";

/** A user-submitted or automated NSFW content flag */
export interface NsfwFlag {
  /** Unique flag ID */
  id: string;
  /** The flagged content entity (message, character, etc.) */
  entityType: "message" | "character" | "asset" | "chat";
  entityId: string;
  /** Who flagged it (user ID or "automated") */
  reporterId: string;
  /** Why it was flagged */
  reason: string;
  /** Current status */
  status: NsfwFlagStatus;
  /** Resolution (if resolved) */
  resolution?: NsfwFlagResolution;
  /** Who resolved it */
  resolvedBy?: string;
  /** When it was resolved */
  resolvedAt?: Date;
  /** Resolution notes */
  resolutionNotes?: string;
  /** When the flag was created */
  created_at: Date;
}

/** Types of NSFW events logged to the audit trail */
export type NsfwAuditEventType =
  | "nsfw.gate.checked"
  | "nsfw.gate.blocked"
  | "nsfw.gate.allowed"
  | "nsfw.consent.given"
  | "nsfw.consent.revoked"
  | "nsfw.consent.overridden"
  | "nsfw.rating.enforced"
  | "nsfw.content.flagged"
  | "nsfw.content.moderated"
  | "nsfw.moderation.action"
  | "nsfw.user.blocked"
  | "nsfw.user.banned"
  | "nsfw.user.shadowed";

/** A single NSFW audit trail entry */
export interface NsfwAuditEntry {
  /** Unique entry ID */
  id: string;
  /** Event type */
  event_type: NsfwAuditEventType;
  /** When the event occurred */
  timestamp: Date;
  /** Who triggered the event (user ID or "system") */
  actor_id: string;
  /** Target of the event (user, chat, character, message) */
  target_type?: "user" | "chat" | "character" | "message";
  target_id?: string;
  /** Whether the event was allowed or blocked */
  outcome: "allowed" | "blocked" | "warning" | "info";
  /** Human-readable description */
  description: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
