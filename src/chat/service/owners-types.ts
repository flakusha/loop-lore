// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Owners-set option/result envelopes (epic-chat-multi-ownership).
 *
 * Split from ./ownership-types to keep both under the file-size gate.
 */
import type { ServiceError, } from "./types";

/** Ceiling on concurrent owners per chat (open decision: config knob vs constant — see epic). */
export const MAX_CHAT_OWNERS = 3;

/** Input for granting a user co-ownership of a chat. `actorId` names an ACTOR. */
export interface AddChatOwnerOptions {
  chatId: string;
  requesterId: string;
  requesterRole: string | null | undefined;
  actorId: string;
  reason?: string;
}

/** Input for removing a user from a chat's owners set. `userId` names a USER; self-removal = resign. */
export interface RemoveChatOwnerOptions {
  chatId: string;
  requesterId: string;
  requesterRole: string | null | undefined;
  userId: string;
  reason?: string;
}

/** Result payload for owners-set mutations. */
export interface ChatOwnersOpResult {
  chatId: string;
  userId: string;
  /** Owner user ids after the operation (sorted for assertion stability). */
  owners: string[];
  /** True when the target was invited as a participant as part of the grant. */
  autoInvited?: boolean;
}

/** Outcome envelope shared by add/remove. */
export type ChatOwnersOpOutcome =
  | { ok: true; result: ChatOwnersOpResult }
  | { ok: false; error: ServiceError };
