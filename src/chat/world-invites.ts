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
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import {
  generateInviteCode,
  type InviteError,
  type InviteResult,
} from "./invites";

export interface WorldInviteRow {
  id: string;
  worldId: string;
  code: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  revoked: boolean;
}

export interface CreateWorldInviteInput {
  worldId: string;
  createdBy: string;
  /** ISO timestamp — invite becomes invalid after this point. */
  expiresAt?: string | null;
  /** Maximum number of redemptions (null = unlimited). */
  maxUses?: number | null;
}

function toRow(row: {
  id: string;
  world_id: string;
  code: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked: number;
},): WorldInviteRow {
  return {
    id: row.id,
    worldId: row.world_id,
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
 * Create a new invite for a world with a unique code.
 *
 * Retries code generation on the (rare) collision. `expiresAt` and `maxUses`
 * are optional; both being unset yields a code that never expires and has no
 * redemption cap.
 *
 * @throws on unexpected DB failure (caller should let it bubble to error handling)
 */
export async function createWorldInvite(
  database: Kysely<DB>,
  input: CreateWorldInviteInput,
): Promise<InviteResult<WorldInviteRow>> {
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
        .insertInto("world_invites",)
        .values({
          id,
          world_id: input.worldId,
          code,
          created_by: input.createdBy,
          expires_at: input.expiresAt ?? null,
          max_uses: input.maxUses ?? null,
          uses: 0,
          revoked: 0,
        },)
        .execute();
      const row = await database
        .selectFrom("world_invites",)
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

/** List all invites for a world (including revoked/expired), newest first. */
export async function listWorldInvites(
  database: Kysely<DB>,
  worldId: string,
): Promise<WorldInviteRow[]> {
  const rows = await database
    .selectFrom("world_invites",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .orderBy("created_at", "desc",)
    .execute();
  return Array.from(rows, (row,) => toRow(row,),);
}

// ── Revoke ──────────────────────────────────────────────────

/**
 * Revoke a world invite so it can no longer be redeemed. Revoking an invite
 * that does not exist (or belongs to a different world) returns `not_found`,
 * mirroring chat/invites.ts.
 */
export async function revokeWorldInvite(
  database: Kysely<DB>,
  worldId: string,
  inviteId: string,
): Promise<InviteResult<{ id: string; revoked: boolean }>> {
  const existing = await database
    .selectFrom("world_invites",)
    .select(["id", "world_id", "revoked",],)
    .where("id", "=", inviteId,)
    .executeTakeFirst();

  if (existing?.world_id !== worldId) {
    return { ok: false, error: { code: "not_found", message: "Invite not found", }, };
  }

  await database
    .updateTable("world_invites",)
    .set({ revoked: 1, },)
    .where("id", "=", inviteId,)
    .execute();

  return { ok: true, value: { id: inviteId, revoked: true, }, };
}

// ── Redeem (join) ───────────────────────────────────────────

export type WorldRedeemOutcome =
  | { ok: true; worldId: string; alreadyMember: boolean }
  | { ok: false; error: InviteError };

/**
 * Redeem a world invite code to join a world.
 *
 * Validates the code (exists, not revoked, not expired, not used up), then
 * adds the joining user's actor to `world_members`. If the user is already a
 * member the redemption still succeeds (idempotent join).
 *
 * The redemption and member insert are committed in the same transaction to
 * avoid double-redeeming a capped invite under concurrency.
 *
 * @param actorId - the joining user's actor id (== user id)
 */
export async function redeemWorldInvite(
  database: Kysely<DB>,
  input: { code: string; actorId: string },
): Promise<WorldRedeemOutcome> {
  const code = input.code.trim().toUpperCase();

  const invite = await database
    .selectFrom("world_invites",)
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

  // Idempotent join: if already a member, succeed without consuming a use.
  const existing = await database
    .selectFrom("world_members",)
    .select("actor_id",)
    .where("world_id", "=", invite.world_id,)
    .where("actor_id", "=", input.actorId,)
    .executeTakeFirst();

  if (existing) {
    return { ok: true, worldId: invite.world_id, alreadyMember: true, };
  }

  if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
    return { ok: false, error: { code: "used_up", message: "Invite has reached its usage limit", }, };
  }

  await database.transaction().execute(async (trx,) => {
    await trx
      .insertInto("world_members",)
      .values({
        world_id: invite.world_id,
        actor_id: input.actorId,
      },)
      .execute();
    await trx
      .updateTable("world_invites",)
      .set({ uses: invite.uses + 1, },)
      .where("id", "=", invite.id,)
      .execute();
  },);

  return { ok: true, worldId: invite.world_id, alreadyMember: false, };
}
