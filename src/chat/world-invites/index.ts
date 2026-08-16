// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World Invites Service
 *
 * Invite codes for joining a world (chat-only or RPG). Mirrors
 * src/chat/invites.ts (chat-scoped invites) — same code alphabet, same
 * validation rules, same idempotent-join semantics — but redeeming a world
 * invite inserts a `world_members` row instead of a `chat_participants` row.
 *
 * Single-server model: a world invite grants flat membership (no roles).
 * Membership gates unlisted/private worlds in requireWorldAccess.
 */
export { createWorldInvite, } from "./create";
export { listWorldInvites, } from "./list";
export { redeemWorldInvite, } from "./redeem";
export { revokeWorldInvite, } from "./revoke";

export type {
  CreateWorldInviteInput,
  WorldInviteRow,
  WorldRedeemOutcome,
} from "./types";
