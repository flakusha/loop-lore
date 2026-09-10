// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/delivery.ts — envelope push (sender) + receive (receiver).
//
// The sender pushes a sealed envelope against a receiver-side reservation;
// the receiver decrypts, hash-verifies, and applies last-writer-wins on
// `(clock, contentHash)`. A stored delivery confirms its reservation
// (reserved → pushed → confirmed).

import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../db/schema";
import { type ContentCipher, } from "./cipher";
import { type ContentEnvelope, openEnvelope, } from "./envelope";
import { type PeerPost, } from "./peer-fetch";
import { advanceReservation, } from "./sharing";

/** Delivery outcome. */
export type DeliveryVerdict = "stored" | "stale";

/**
 * Receive a pushed envelope: decrypt, verify integrity, and apply
 * last-writer-wins against the deliveries record. Higher clock wins;
 * clock ties break toward the lexicographically smaller hash. A stored
 * delivery confirms its reservation (reserved → pushed → confirmed).
 * @param database Receiver database handle.
 * @param envelope
 * @param cipher
 * @param opts Optional reservation confirmation.
 */
export async function receiveDelivery(
  database: Kysely<DB>,
  envelope: ContentEnvelope,
  cipher: ContentCipher,
  opts: { reservationId?: string } = {},
): Promise<DeliveryVerdict> {
  await openEnvelope(envelope, cipher,);
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
    .onConflict((oc,) =>
      oc.column("content_id",).doUpdateSet({
        origin: envelope.origin,
        content_hash: envelope.hash,
        clock: envelope.clock,
        received_at: sql`(datetime('now'))`,
      },)
    )
    .execute();
  if (opts.reservationId !== undefined) {
    await advanceReservation(database, opts.reservationId, "pushed",);
    await advanceReservation(database, opts.reservationId, "confirmed",);
  }
  return "stored";
}

/**
 * Push an envelope to a receiving peer (sender side).
 * @param post Transport POST.
 * @param origin Receiver origin.
 * @param envelope Sealed envelope.
 * @param reservationId Receiver-side reservation to confirm.
 * @returns Delivery verdict.
 */
export async function pushEnvelope(
  post: PeerPost,
  origin: string,
  envelope: ContentEnvelope,
  reservationId?: string,
): Promise<DeliveryVerdict> {
  const response = await post(`${origin}/api/mesh-deliver`, { envelope, reservationId, },);
  const verdict = (response.body as { verdict?: unknown } | null)?.verdict;
  if (!response.ok || (verdict !== "stored" && verdict !== "stale")) {
    throw new Error(`delivery refused by ${origin} (status ${response.status})`,);
  }
  return verdict;
}
