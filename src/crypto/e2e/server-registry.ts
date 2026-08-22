// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Public Key Server Registry (TASK-asymmetric-key-pairs-followup)
 *
 * Stores per-actor ECDH public keys so the server can relay them to other
 * participants. The server NEVER sees private keys.
 *
 * Operations:
 *   - registerPublicKey: client uploads its public-key JWK; replaces any
 *     existing active row for the actor (single active key per actor).
 *   - getActivePublicKey: read the current public key for one actor.
 *   - listActivePublicKeys: bulk-read for distributing to new chat joiners.
 *   - revokePublicKey: soft-revoke (sets revoked_at). Old row stays for audit.
 *
 * Threat model:
 *   - The server is honest-but-curious: it relays ciphertext but cannot
 *     decrypt. A compromised server could substitute public keys (MITM).
 *     Out-of-band fingerprint verification is the user-side mitigation,
 *     not handled here.
 */

import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

const DEFAULT_ALGORITHM = "ECDH-P256" as const;

export interface PublicKeyRow {
  id: string;
  actorId: string;
  publicKeyJwk: JsonWebKey;
  algorithm: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface RegisterPublicKeyOpts {
  database: Kysely<DB>;
  actorId: string;
  publicKeyJwk: JsonWebKey;
  algorithm?: string;
  expiresAt?: string;
}

export interface GetActivePublicKeyOpts {
  database: Kysely<DB>;
  actorId: string;
}

export interface ListActivePublicKeysOpts {
  database: Kysely<DB>;
  actorIds: string[];
}

export interface RevokePublicKeyOpts {
  database: Kysely<DB>;
  actorId: string;
}

/**
 * Register (or rotate) the public key for an actor. Replaces any existing
 * active row for that actor — only one active pubkey per actor at a time.
 * The old row is soft-revoked (revoked_at set) for audit history.
 */
export async function registerPublicKey(opts: RegisterPublicKeyOpts,): Promise<PublicKeyRow> {
  const { database, actorId, publicKeyJwk, } = opts;
  const algorithm = opts.algorithm ?? DEFAULT_ALGORITHM;
  const id = uid();
  const now = sql`(datetime('now'))`;

  // Soft-revoke any existing active row so the unique index lets us insert.
  // COALESCE preserves any pre-existing revoked_at (no-op when already revoked).
  await database
    .updateTable("actor_e2e_pubkeys",)
    .set({ revoked_at: sql`COALESCE(revoked_at, datetime('now'))`, },)
    .where("actor_id", "=", actorId,)
    .where("revoked_at", "is", null,)
    .execute();

  await database
    .insertInto("actor_e2e_pubkeys",)
    .values({
      id,
      actor_id: actorId,
      public_key_jwk: JSON.stringify(publicKeyJwk,),
      algorithm,
      created_at: now as unknown as string,
      expires_at: opts.expiresAt ?? null,
      revoked_at: null,
    },)
    .execute();

  const row = await database
    .selectFrom("actor_e2e_pubkeys",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();

  return rowToPublicKey(row,);
}

/**
 * Read the active public key for one actor. Returns null if none is
 * registered or the only one has been revoked.
 */
export async function getActivePublicKey(opts: GetActivePublicKeyOpts,): Promise<PublicKeyRow | null> {
  const row = await opts.database
    .selectFrom("actor_e2e_pubkeys",)
    .selectAll()
    .where("actor_id", "=", opts.actorId,)
    .where("revoked_at", "is", null,)
    .executeTakeFirst();
  if (!row) { return null; }
  return rowToPublicKey(row,);
}

/**
 * Bulk read active public keys for many actors. Useful when a new participant
 * joins a chat and needs all current participants' pubkeys to seed a
 * sender-key ratchet (future ticket).
 */
export async function listActivePublicKeys(opts: ListActivePublicKeysOpts,): Promise<PublicKeyRow[]> {
  if (opts.actorIds.length === 0) { return []; }
  const rows = await opts.database
    .selectFrom("actor_e2e_pubkeys",)
    .selectAll()
    .where("actor_id", "in", opts.actorIds,)
    .where("revoked_at", "is", null,)
    .orderBy("created_at", "asc",)
    .execute();
  return rows.map(rowToPublicKey,);
}

/**
 * Soft-revoke the active public key for an actor. Idempotent: revoking when
 * no active key exists is a no-op.
 */
export async function revokePublicKey(opts: RevokePublicKeyOpts,): Promise<boolean> {
  const result = await opts.database
    .updateTable("actor_e2e_pubkeys",)
    .set({ revoked_at: sql`datetime('now')`, },)
    .where("actor_id", "=", opts.actorId,)
    .where("revoked_at", "is", null,)
    .execute();
  return result.length > 0 && result[0]!.numUpdatedRows > 0n;
}

// ── Internal helpers ───────────────────────────────────────

interface ActorE2EPubkeyRow {
  id: string;
  actor_id: string;
  public_key_jwk: string;
  algorithm: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

function rowToPublicKey(row: ActorE2EPubkeyRow,): PublicKeyRow {
  let publicKeyJwk: JsonWebKey;
  try {
    publicKeyJwk = JSON.parse(row.public_key_jwk,) as JsonWebKey;
  } catch {
    throw new Error(`actor_e2e_pubkeys row ${row.id}: malformed public_key_jwk`,);
  }
  return {
    id: row.id,
    actorId: row.actor_id,
    publicKeyJwk,
    algorithm: row.algorithm,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}
