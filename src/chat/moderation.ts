// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Moderation Primitives
 *
 * Block, ban, shadow, collapse, and flag operations.
 * This module defines the data structures and pure logic for moderation.
 * Database operations are in the service layer.
 */
import { can, } from "../users/permissions";
import type {
  ModerationAction,
  ModerationActionType,
  ModerationScope,
} from "./types";

// ─── Action Creation ──────────────────────────────────────────

/**
 * Create a moderation action record.
 * @param params - Action parameters
 * @param params.type
 * @param params.targetActorId
 * @param params.scope
 * @param params.actorId
 * @param params.reason
 * @param params.internal
 * @returns A new ModerationAction
 */
export function createModerationAction(params: {
  type: ModerationActionType;
  targetActorId: string;
  scope: ModerationScope;
  actorId: string;
  reason?: string;
  internal?: boolean;
},): ModerationAction {
  return {
    type: params.type,
    targetActorId: params.targetActorId,
    scope: params.scope,
    actorId: params.actorId,
    reason: params.reason,
    internal: params.internal ?? true,
  };
}

// ─── Permission Checks ────────────────────────────────────────

/**
 * Check if a moderation action is allowed.
 *
 * Rules:
 * - Users cannot moderate themselves
 * - Only admins/owners can ban
 * - Only chat owners can shadow/collapse within a chat
 * - Anyone can flag (internal report)
 * @param action - Proposed moderation action
 * @param callerRole - Role of the person attempting the action
 * @param isTargetSelf - Whether the target is the caller
 * @returns
 */
export function checkModerationPermission(
  action: ModerationAction,
  callerRole: string,
  isTargetSelf: boolean,
): { allowed: boolean; reason?: string } {
  if (isTargetSelf) {
    return { allowed: false, reason: "Cannot moderate yourself", };
  }

  switch (action.type) {
    case "ban": {
      if (!can(callerRole, "admin.chat",) && callerRole !== "owner") {
        return { allowed: false, reason: "Only admins can ban users", };
      }
      break;
    }

    case "shadow":
    case "collapse": {
      if (callerRole !== "owner" && !can(callerRole, "admin.chat",) && action.scope === "chat") {
        return { allowed: false, reason: "Only chat owners can shadow/collapse messages", };
      }
      break;
    }

    case "block": {
      // Any user can block another user
      break;
    }

    case "flag": {
      // Anyone can flag
      break;
    }
  }

  return { allowed: true, };
}

// ─── Scope Checks ─────────────────────────────────────────────

/**
 * Check if a user is blocked in a given scope.
 * @param blocks - List of active block actions
 * @param targetActorId - User to check
 * @param scope - Scope to check (chat, global, etc.)
 * @returns True if the user is blocked
 */
export function isBlocked(
  blocks: ModerationAction[],
  targetActorId: string,
  scope: ModerationScope,
): boolean {
  for (const b of blocks) {
    if (
      b.type === "block" &&
      b.targetActorId === targetActorId &&
      (b.scope === scope || b.scope === "global")
    ) { return true; }
  }
  return false;
}

/**
 * Check if a user is banned.
 * @param bans - List of active ban actions
 * @param targetActorId - User to check
 * @returns True if the user is banned
 */
export function isBanned(bans: ModerationAction[], targetActorId: string,): boolean {
  for (const b of bans) {
    if (b.type === "ban" && b.targetActorId === targetActorId) { return true; }
  }
  return false;
}

/**
 * Check if a viewer is affected by shadow/collapse actions.
 *
 * In the current system, shadow/collapse actions target a viewer
 * (the person who cannot see the content), not a specific message.
 * This is a simplified check — full implementation would be per-message.
 * @param actions - List of shadow/collapse actions
 * @param viewerId - Who is viewing
 * @returns "shadow" | "collapse" | null
 */
export function getShadowState(
  actions: ModerationAction[],
  viewerId: string,
): "shadow" | "collapse" | null {
  for (const a of actions) {
    if (a.type === "shadow" && a.targetActorId === viewerId) { return "shadow"; }
    if (a.type === "collapse" && a.targetActorId === viewerId) { return "collapse"; }
  }
  return null;
}
