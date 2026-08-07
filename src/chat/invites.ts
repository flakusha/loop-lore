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
 *
 * See .plan/tickets/invite-code-generation.md and .plan/tickets/join-flow-mechanics.md.
 */
import type { Kysely, } from "kysely";
import { randomBytes, } from "node:crypto";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";

/** Error codes surfaced by the invites service. */
export type InviteErrorCode =
  | "not_found"
  | "forbidden"
  | "expired"
  | "revoked"
  | "used_up"
  | "conflict"
  | "bad_request";

export interface InviteError {
  code: InviteErrorCode;
  message: string;
}

export type InviteResult<T,> = { ok: true; value: T } | { ok: false; error: InviteError };

export interface ChatInviteRow {
  id: string;
  chatId: string;
  code: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  revoked: boolean;
}

export interface CreateInviteInput {
  chatId: string;
  createdBy: string;
  /** ISO timestamp — invite becomes invalid after this point. */
  expiresAt?: string | null;
  /** Maximum number of redemptions (null = unlimited). */
  maxUses?: number | null;
}

// ── Code generation ─────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
const CODE_LENGTH = 8;

/** Generate a short, human-friendly invite code. */
export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH,);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }
  return code;
}

function toRow(row: {
  id: string;
  chat_id: string;
  code: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked: number;
},): ChatInviteRow {
  return {
    id: row.id,
    chatId: row.chat_id,
    code: row.code,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    revoked: row.revoked === 1,
  };
}

// ── Create ──────────────────────────────────────────────────

/**
 * Create a new invite for a chat with a unique code.
 *
 * Retries code generation on the (rare) collision. `expiresAt` and `maxUses`
 * are optional; both being unset yields a code that never expires and has no
 * redemption cap.
 *
 * @throws on unexpected DB failure (caller should let it bubble to error handling)
 */
export async function createInvite(
  database: Kysely<DB>,
  input: CreateInviteInput,
): Promise<InviteResult<ChatInviteRow>> {
  if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses < 1) {
    return { ok: false, error: { code: "bad_request", message: "maxUses must be at least 1", }, };
  }
  if (
    input.expiresAt &&
    input.expiresAt !== null &&
    Number.isNaN(Date.parse(input.expiresAt,),)
  ) {
    return { ok: false, error: { code: "bad_request", message: "Invalid expiresAt", }, };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const id = uid();
    try {
      await database
        .insertInto("chat_invites",)
        .values({
          id,
          chat_id: input.chatId,
          code,
          created_by: input.createdBy,
          expires_at: input.expiresAt ?? null,
          max_uses: input.maxUses ?? null,
          uses: 0,
          revoked: 0,
        },)
        .execute();
      const row = await database
        .selectFrom("chat_invites",)
        .selectAll()
        .where("id", "=", id,)
        .executeTakeFirst();
      if (!row) {
        return { ok: false, error: { code: "not_found", message: "Invite not found after insert", }, };
      }
      return { ok: true, value: toRow(row,), };
    } catch (error) {
      // Unique constraint on `code` — retry with a fresh code.
      const msg = error instanceof Error ? error.message : String(error,);
      if (msg.includes("UNIQUE",) || msg.includes("constraint",)) {
        continue;
      }
      throw error;
    }
  }

  return { ok: false, error: { code: "conflict", message: "Failed to generate a unique code", }, };
}

// ── List ────────────────────────────────────────────────────

/** List all invites for a chat (including revoked/expired), newest first. */
export async function listInvites(
  database: Kysely<DB>,
  chatId: string,
): Promise<ChatInviteRow[]> {
  const rows = await database
    .selectFrom("chat_invites",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .execute();
  return Array.from(rows, (row,) => toRow(row,),);
}

// ── Revoke ──────────────────────────────────────────────────

/**
 * Revoke an invite so it can no longer be redeemed. Idempotent — revoking an
 * already-revoked or missing invite is a no-op success (matching the "skip
 * duplicate" tolerance used elsewhere in participant management).
 */
export async function revokeInvite(
  database: Kysely<DB>,
  chatId: string,
  inviteId: string,
): Promise<InviteResult<{ id: string; revoked: boolean }>> {
  const existing = await database
    .selectFrom("chat_invites",)
    .select(["id", "chat_id", "revoked",],)
    .where("id", "=", inviteId,)
    .executeTakeFirst();

  if (existing?.chat_id !== chatId) {
    return { ok: false, error: { code: "not_found", message: "Invite not found", }, };
  }

  await database
    .updateTable("chat_invites",)
    .set({ revoked: 1, },)
    .where("id", "=", inviteId,)
    .execute();

  return { ok: true, value: { id: inviteId, revoked: true, }, };
}

// ── Redeem (join) ───────────────────────────────────────────

export type RedeemOutcome =
  | { ok: true; chatId: string; alreadyMember: boolean }
  | { ok: false; error: InviteError };

/**
 * Redeem an invite code to join a chat.
 *
 * Validates the code (exists, not revoked, not expired, not used up), then adds
 * the joining user's actor to `chat_participants` as role "member". If the user
 * is already a participant the redemption still succeeds (idempotent join).
 *
 * The redemption and participant insert are committed in the same transaction
 * to avoid double-redeeming a capped invite under concurrency.
 *
 * @param actorId - the joining user's actor id (== user id)
 */
export async function redeemInvite(
  database: Kysely<DB>,
  input: { code: string; actorId: string },
): Promise<RedeemOutcome> {
  const code = input.code.trim().toUpperCase();

  const invite = await database
    .selectFrom("chat_invites",)
    .selectAll()
    .where("code", "=", code,)
    .executeTakeFirst();

  if (!invite) {
    return { ok: false, error: { code: "not_found", message: "Invalid invite code", }, };
  }
  if (invite.revoked === 1) {
    return { ok: false, error: { code: "revoked", message: "Invite has been revoked", }, };
  }
  if (invite.expires_at && Date.parse(invite.expires_at,) < Date.now()) {
    return { ok: false, error: { code: "expired", message: "Invite has expired", }, };
  }

  // Idempotent join: if already a participant, succeed without consuming a use
  // (checked before the usage cap so an existing member can always re-join).
  const existing = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", invite.chat_id,)
    .where("actor_id", "=", input.actorId,)
    .executeTakeFirst();

  if (existing) {
    return { ok: true, chatId: invite.chat_id, alreadyMember: true, };
  }

  if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
    return { ok: false, error: { code: "used_up", message: "Invite has reached its usage limit", }, };
  }

  await database.transaction().execute(async (trx,) => {
    await trx
      .insertInto("chat_participants",)
      .values({
        chat_id: invite.chat_id,
        actor_id: input.actorId,
        role_in_chat: "member" as never,
      },)
      .execute();
    await trx
      .updateTable("chat_invites",)
      .set({ uses: invite.uses + 1, },)
      .where("id", "=", invite.id,)
      .execute();
  },);

  return { ok: true, chatId: invite.chat_id, alreadyMember: false, };
}
