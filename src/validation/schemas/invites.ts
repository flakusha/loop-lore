// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat + world invite route validation schemas.
 */

import { t, } from "elysia";
import { Id, } from "./primitives";

// ── Chat invite routes ─────────────────────────────────────

/** Body for POST /api/chats/:id/invites — create an invite. */
export const InviteCreateBody = t.Object({
  /** ISO timestamp after which the invite is invalid (null/omitted = never expires). */
  expiresAt: t.Optional(t.Nullable(t.String(),),),
  /** Max redemptions (null/omitted = unlimited). */
  maxUses: t.Optional(t.Nullable(t.Numeric({ minimum: 1, },),),),
},);

/** Invite response shape. */
export const InviteSchema = t.Object({
  id: t.String({ minLength: 1, },),
  chatId: t.String({ minLength: 1, },),
  code: t.String({ minLength: 1, },),
  createdBy: t.Nullable(t.String(),),
  createdAt: t.String({ minLength: 1, },),
  expiresAt: t.Nullable(t.String(),),
  maxUses: t.Nullable(t.Numeric(),),
  uses: t.Numeric(),
  revoked: t.Boolean(),
},);

/** Params for chat-scoped invite routes: POST/GET /api/chats/:id/invites. */
export const InviteChatParams = t.Object({
  id: Id,
},);

/** Params for invite-scoped routes: chat id + invite id. */
export const InviteParams = t.Object({
  id: Id,
  inviteId: Id,
},);

/** Params for POST /api/invites/:code/join. */
export const InviteJoinParams = t.Object({
  code: t.String({ minLength: 1, },),
},);

// ── World invite routes ────────────────────────────────────

/** World invite response shape (mirror of InviteSchema, world-scoped). */
export const WorldInviteSchema = t.Object({
  id: t.String({ minLength: 1, },),
  worldId: t.String({ minLength: 1, },),
  code: t.String({ minLength: 1, },),
  createdBy: t.Nullable(t.String(),),
  createdAt: t.String({ minLength: 1, },),
  expiresAt: t.Nullable(t.String(),),
  maxUses: t.Nullable(t.Numeric(),),
  uses: t.Numeric(),
  revoked: t.Boolean(),
},);

/** Params for world-scoped invite routes: world id + invite id. */
export const WorldInviteParams = t.Object({
  worldId: Id,
  inviteId: Id,
},);
