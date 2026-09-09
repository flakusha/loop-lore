// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/sharing.ts — Phase 2: encrypted content envelopes +
// reservation lifecycle + delivery with last-writer-wins conflict handling.
//
// Content crypto reuses the existing `encryptValue` seam (AES-GCM, salted)
// with an operator-supplied mesh PSK — no new primitives, no plaintext on
// the wire. Key distribution (per-peer wrapping) is follow-up work tied to
// the peer signing key store. Capacity enforcement hooks into the quota
// ticket; reservations record intent + expiry, not allowance.

import { createHash, } from "node:crypto";
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { decryptValue, encryptValue, } from "../crypto/byok";
import type { DB, } from "../db/schema";
import { canonicalOrigin, } from "./peer-fetch";

/** Reservation states (forward chain with release/expire exits). */
export const RESERVATION_STATES = [
  "reserved",
  "pushed",
  "confirmed",
  "released",
  "expired",
] as const;
/** Reservation state. */
export type ReservationState = (typeof RESERVATION_STATES)[number];

/** Legal forward transitions (release/expire handled separately). */
const NEXT_RESERVATION: Record<"reserved" | "pushed", ReservationState> = {
  "reserved": "pushed",
  "pushed": "confirmed",
};

/** Default reservation TTL (push must complete within this window). */
export const DEFAULT_RESERVATION_TTL_MS = 10 * 60 * 1_000;

/** Wire envelope for one content push. */
export interface ContentEnvelope {
  /** Content id (stable across retries/duplicates). */
  id: string;
  /** Sending origin. */
  origin: string;
  /** Sender wall-clock ms (LWW ordering). */
  clock: number;
  /** Content type label. */
  type: string;
  /** SHA-256 hex of the plaintext. */
  hash: string;
  /** Plaintext byte length. */
  size: number;
  /** AES-GCM ciphertext over base64 plaintext. */
  ciphertext: string;
}

/**
 * Seal plaintext into a content envelope.
 * @param input
 */
export async function sealContent(input: {
  id: string;
  origin: string;
  clock?: number;
  type?: string;
  content: Uint8Array | string;
  secret: string;
},): Promise<ContentEnvelope> {
  const bytes = typeof input.content === "string"
    ? new TextEncoder().encode(input.content,)
    : input.content;
  const hash = createHash("sha256",).update(bytes,).digest("hex",);
  const base64 = Buffer.from(bytes,).toString("base64",);
  return {
    id: input.id,
    origin: input.origin,
    clock: input.clock ?? Date.now(),
    type: input.type ?? "blob",
    hash,
    size: bytes.length,
    ciphertext: await encryptValue(base64, input.secret,),
  };
}

/**
 * Open an envelope: decrypt and verify the plaintext hash.
 * @param envelope
 * @param secret
 * @throws On decrypt failure or hash mismatch.
 */
export async function openEnvelope(
  envelope: ContentEnvelope,
  secret: string,
): Promise<Uint8Array> {
  const base64 = await decryptValue(envelope.ciphertext, secret,);
  const bytes = Buffer.from(base64, "base64",);
  const hash = createHash("sha256",).update(bytes,).digest("hex",);
  if (hash !== envelope.hash) {
    throw new Error(`content hash mismatch for ${envelope.id}`,);
  }
  if (bytes.length !== envelope.size) {
    throw new Error(`content size mismatch for ${envelope.id}`,);
  }
  return bytes;
}

/**
 * Reserve a push slot on a known peer. The peer row must exist.
 * @param database
 * @param input
 * @returns Reservation id.
 */
export async function reserveSlot(
  database: Kysely<DB>,
  input: {
    peerOrigin: string;
    contentHash: string;
    sizeBytes: number;
    contentType?: string;
    ttlMs?: number;
    now?: number;
  },
): Promise<string> {
  const origin = canonicalOrigin(input.peerOrigin,);
  if (origin === null) { throw new Error(`invalid peer origin: ${input.peerOrigin}`,); }
  const peer = await database
    .selectFrom("mesh_peers",)
    .select("origin",)
    .where("origin", "=", origin,)
    .executeTakeFirst();
  if (!peer) { throw new Error(`unknown peer: ${origin}`,); }
  const now = input.now ?? Date.now();
  const id = crypto.randomUUID();
  await database
    .insertInto("mesh_reservations",)
    .values({
      id,
      peer_origin: origin,
      content_hash: input.contentHash,
      size_bytes: input.sizeBytes,
      content_type: input.contentType ?? "blob",
      state: "reserved",
      expires_at: new Date(now + (input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS),).toISOString(),
    },)
    .execute();
  return id;
}

/**
 * Advance a reservation one forward step (reserved → pushed → confirmed).
 * @param database
 * @param id
 * @param next
 */
export async function advanceReservation(
  database: Kysely<DB>,
  id: string,
  next: ReservationState,
): Promise<void> {
  const row = await database
    .selectFrom("mesh_reservations",)
    .select(["state",],)
    .where("id", "=", id,)
    .executeTakeFirst();
  if (!row) { throw new Error(`unknown reservation: ${id}`,); }
  const current = row.state as ReservationState;
  const legal = (current === "reserved" || current === "pushed") &&
    NEXT_RESERVATION[current] === next;
  if (!legal) {
    throw new Error(`illegal reservation transition: ${current} -> ${next}`,);
  }
  await database
    .updateTable("mesh_reservations",)
    .set({ state: next, },)
    .where("id", "=", id,)
    .execute();
}

/**
 * Release a reservation (sender abort or failed push). Terminal.
 * @param database
 * @param id
 */
export async function releaseReservation(
  database: Kysely<DB>,
  id: string,
): Promise<void> {
  const row = await database
    .selectFrom("mesh_reservations",)
    .select(["state",],)
    .where("id", "=", id,)
    .executeTakeFirst();
  if (!row) { throw new Error(`unknown reservation: ${id}`,); }
  const current = row.state as ReservationState;
  if (current === "confirmed" || current === "released" || current === "expired") {
    throw new Error(`reservation already terminal: ${current}`,);
  }
  await database
    .updateTable("mesh_reservations",)
    .set({ state: "released", },)
    .where("id", "=", id,)
    .execute();
}

/**
 * Expire open reservations past their deadline. Idempotent.
 * @param database
 * @param now
 * @returns Expired count.
 */
export async function sweepExpiredReservations(
  database: Kysely<DB>,
  now: number = Date.now(),
): Promise<number> {
  const cutoff = new Date(now,).toISOString();
  const stale = await database
    .selectFrom("mesh_reservations",)
    .select(["id",],)
    .where("expires_at", "<", cutoff,)
    .where("state", "in", ["reserved", "pushed",],)
    .execute();
  for (const row of stale) {
    await database
      .updateTable("mesh_reservations",)
      .set({ state: "expired", },)
      .where("id", "=", row.id,)
      .execute();
  }
  return stale.length;
}

/** Delivery outcome. */
export type DeliveryVerdict = "stored" | "stale";

/**
 * Receive a pushed envelope: decrypt, verify integrity, and apply
 * last-writer-wins against the deliveries record. Higher clock wins;
 * clock ties break toward the lexicographically smaller hash.
 * @param database
 * @param envelope
 * @param secret
 */
export async function receiveDelivery(
  database: Kysely<DB>,
  envelope: ContentEnvelope,
  secret: string,
): Promise<DeliveryVerdict> {
  await openEnvelope(envelope, secret,);
  const existing = await database
    .selectFrom("mesh_deliveries",)
    .select(["clock", "content_hash",],)
    .where("content_id", "=", envelope.id,)
    .executeTakeFirst();
  if (
    existing &&
    (existing.clock > envelope.clock ||
      (existing.clock === envelope.clock && existing.content_hash <= envelope.hash))
  ) {
    return "stale";
  }
  await database
    .insertInto("mesh_deliveries",)
    .values({
      content_id: envelope.id,
      origin: envelope.origin,
      content_hash: envelope.hash,
      clock: envelope.clock,
    },)
    .onConflict((oc,) => oc.column("content_id",).doUpdateSet({
      origin: envelope.origin,
      content_hash: envelope.hash,
      clock: envelope.clock,
      received_at: sql`(datetime('now'))`,
    },),)
    .execute();
  return "stored";
}

/**
 * Duplication targets: trusted peers excluding the source origin.
 * Policy is an explicit trusted set today; region/nearest rules are quota-
 * phase follow-ups.
 * @param database
 * @param except
 */
export async function selectDuplicationTargets(
  database: Kysely<DB>,
  except?: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("mesh_peers",)
    .select(["origin",],)
    .where("state", "=", "trusted",)
    .orderBy("origin",)
    .execute();
  return rows.map((row,) => row.origin,).filter((origin,) => origin !== except);
}
