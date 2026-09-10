// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/sharing.ts — receiver-side reservation lifecycle.
//
// Reservations live on the RECEIVING side: the sender requests capacity via
// `requestReservation` (POST /api/mesh-reserve, see ./fan-out), pushes the
// envelope (see ./delivery), and the receiver confirms on store. Capacity
// is per-peer (`capacity_bytes`, NULL = unlimited); dynamic quota
// negotiation stays a follow-up. Delivery lives in ./delivery, duplication
// targets in ./duplication, sender fan-out in ./fan-out.

import type { Kysely, } from "kysely";
import { sql, } from "kysely";
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

/** Open (non-terminal) reservation states holding capacity. */
const OPEN_RESERVATION_STATES = ["reserved", "pushed",] as const;

/**
 * Bytes currently held by open reservations for one peer.
 * @param database
 * @param peerOrigin Canonical peer origin.
 */
export async function outstandingBytes(
  database: Kysely<DB>,
  peerOrigin: string,
): Promise<number> {
  const row = await database
    .selectFrom("mesh_reservations",)
    .select(sql<number>`coalesce(sum(size_bytes), 0)`.as("held",),)
    .where("peer_origin", "=", peerOrigin,)
    .where("state", "in", [...OPEN_RESERVATION_STATES,],)
    .executeTakeFirst();
  return row?.held ?? 0;
}

/**
 * Create an inbound reservation (receiver side). The sender peer must be
 * trusted, and the push must fit its remaining capacity.
 * @param database Receiver database handle.
 * @param input
 * @returns Reservation id.
 * @throws On unknown/untrusted peer or exhausted capacity.
 */
export async function createInboundReservation(
  database: Kysely<DB>,
  input: {
    senderOrigin: string;
    contentHash: string;
    sizeBytes: number;
    contentType?: string;
    ttlMs?: number;
    now?: number;
  },
): Promise<string> {
  const origin = canonicalOrigin(input.senderOrigin,);
  if (origin === null) { throw new Error(`invalid sender origin: ${input.senderOrigin}`,); }
  const peer = await database
    .selectFrom("mesh_peers",)
    .select(["origin", "state", "capacity_bytes",],)
    .where("origin", "=", origin,)
    .executeTakeFirst();
  if (!peer || peer.state !== "trusted") { throw new Error(`untrusted peer: ${origin}`,); }
  if (!Number.isFinite(input.sizeBytes,) || input.sizeBytes <= 0) {
    throw new Error(`invalid size: ${input.sizeBytes}`,);
  }
  if (peer.capacity_bytes !== null) {
    const held = await outstandingBytes(database, origin,);
    if (held + input.sizeBytes > peer.capacity_bytes) {
      throw new Error(`peer capacity exhausted: ${origin}`,);
    }
  }
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
    .where("state", "in", [...OPEN_RESERVATION_STATES,],)
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
