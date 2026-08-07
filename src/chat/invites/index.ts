/**
 * Chat Invites Service
 *
 * Backend for the invite/join mechanics:
 *   - `createInvite`  — generate a unique shareable code bound to a chat
 *   - `listInvites`   — list a chat's invites (owner/admin)
 *   - `revokeInvite`  — invalidate an invite so it can no longer be redeemed
 *   - `redeemInvite`  — "join": validate a code and add the joining user's actor
 *                       to the chat as a participant (role "member")
 *
 * A code is redeemable until it is revoked, expires, or exhausts `max_uses`.
 * Access control (who may create/list/revoke) is enforced by the route layer;
 * the service validates the code itself and performs the join atomically.
 *
 * Join semantics: a registered user has a matching `actors` row where
 * `actors.id === users.id` (created at registration). Redeeming an invite adds
 * that actor to `chat_participants`, granting access via `checkChatAccess`.
 */
export { generateInviteCode, } from "./code";

export { createInvite, } from "./create";
export { listInvites, } from "./list";
export { redeemInvite, } from "./redeem";
export { revokeInvite, } from "./revoke";

export type {
  ChatInviteRow,
  CreateInviteInput,
  InviteError,
  InviteErrorCode,
  InviteResult,
  RedeemOutcome,
} from "./types";
