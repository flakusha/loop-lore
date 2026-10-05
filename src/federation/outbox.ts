// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/outbox.ts — sender-side retry queue for failed pushes.
//
// fanOutContent drops nothing silently: a failed push lands a mesh_outbox
// row (038_mesh_outbox) keyed on (target_origin, content_id); the
// `federation.outbox-drain` cron re-pushes the stored envelope with
// exponential backoff and dead-letters once attempts are exhausted. Retries
// re-send identical sealed bytes — receiver-side last-writer-wins dedup
// (./delivery) keeps them idempotent.

import type { Kysely, } from "kysely";
import type { FederationPeerTrustConfig, } from "../config/schema";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../utils";
import { toDate, } from "../utils/date";
import { pushEnvelope, } from "./delivery";
import type { ContentEnvelope, } from "./envelope";
import { requestReservation, } from "./fan-out";
import { type PeerPost, postPeerJson, } from "./peer-fetch";

/** Retire a row once this many drain failures accumulate. */
export const OUTBOX_MAX_ATTEMPTS = 8;
/** First backoff delay; doubles per attempt (base * 2^attempts). */
export const OUTBOX_BASE_BACKOFF_MS = 60_000;
/** Due rows handled per drain pass. */
export const OUTBOX_BATCH_SIZE = 25;

/**
 * Record (or refresh) a pending retry for one failed push. Upsert keyed on
 * (target_origin, content_id): a repeated failure updates the stored
 * envelope instead of duplicating the row.
 * @param database Sender database handle.
 * @param entry Target origin, content id, and the sealed envelope as pushed.
 * @param entry.targetOrigin
 * @param entry.contentId
 * @param entry.envelope
 * @returns {Promise<void>}
 */
export async function queueOutboxRetry(
  database: Kysely<DB>,
  entry: { targetOrigin: string; contentId: string; envelope: ContentEnvelope },
): Promise<void> {
  const envelope = jsonStringifyOr(entry.envelope, "{}",);
  const due = new Date().toISOString();
  await database
    .insertInto("mesh_outbox",)
    .values({
      target_origin: entry.targetOrigin,
      content_id: entry.contentId,
      envelope,
      next_attempt_at: due,
    },)
    .onConflict((oc,) =>
      oc.columns(["target_origin", "content_id",],).doUpdateSet({
        envelope,
        status: "pending",
        attempts: 0,
        next_attempt_at: due,
      },)
    )
    .execute();
}

/**
 * Flip the retry entry to done after a successful push (no-op when absent).
 * @param database Sender database handle.
 * @param targetOrigin Receiver origin.
 * @param contentId Delivered content id.
 * @returns {Promise<void>}
 */
export async function markOutboxDone(
  database: Kysely<DB>,
  targetOrigin: string,
  contentId: string,
): Promise<void> {
  await database
    .updateTable("mesh_outbox",)
    .set({ status: "done", },)
    .where("target_origin", "=", targetOrigin,)
    .where("content_id", "=", contentId,)
    .execute();
}

/** Outcome of one drain pass. */
export interface MeshOutboxPassSummary {
  /** Due rows attempted. */
  checked: number;
  /** Rows delivered and flipped to done. */
  delivered: number;
  /** Rows that failed and were rescheduled with backoff. */
  retried: number;
  /** Rows retired (failures exhausted or envelope unparseable). */
  dead: number;
}

/**
 * Recover a stored envelope; null when the JSON is not one.
 * @param raw
 */
function parseEnvelope(raw: string,): ContentEnvelope | null {
  const parsed = safeJsonParse<Partial<ContentEnvelope> | null>(raw,);
  if (!parsed.ok) { return null; }

  const value = parsed.value;
  return value && typeof value.id === "string" && typeof value.ciphertext === "string"
    ? value as ContentEnvelope
    : null;
}

/**
 * Drain due mesh_outbox rows: re-push each stored envelope via
 * pushEnvelope, flip to done on delivery, else bump attempts and reschedule
 * at now + base * 2^attempts — dead once attempts hit the maximum. Per-row
 * failures never abort the pass.
 * @param database Sender database handle.
 * @param opts Transport/trust seam (mirrors runResyncPass) + tuning overrides.
 * @param opts.trustByOrigin Per-peer TLS trust for the default transport.
 * @param opts.postImpl Transport POST (injectable for tests).
 * @param opts.now Wall-clock ms bounding the due-set (injectable for tests).
 * @param opts.batch Max rows per pass.
 * @param opts.maxAttempts Failure threshold before dead-lettering.
 * @param opts.baseBackoffMs Backoff base in ms.
 * @returns {Promise<MeshOutboxPassSummary>}
 */
export async function runMeshOutboxPass(
  database: Kysely<DB>,
  opts: {
    trustByOrigin?: Record<string, FederationPeerTrustConfig | undefined>;
    postImpl?: PeerPost;
    now?: number;
    batch?: number;
    maxAttempts?: number;
    baseBackoffMs?: number;
  } = {},
): Promise<MeshOutboxPassSummary> {
  const nowMs = opts.now ?? Date.now();
  const maxAttempts = opts.maxAttempts ?? OUTBOX_MAX_ATTEMPTS;
  const baseBackoffMs = opts.baseBackoffMs ?? OUTBOX_BASE_BACKOFF_MS;
  const post: PeerPost = opts.postImpl ?? ((url: string, body: unknown,) => {
    const trust = opts.trustByOrigin?.[new URL(url,).origin];
    return postPeerJson(url, body, trust,);
  });

  const due = await database
    .selectFrom("mesh_outbox",)
    .selectAll()
    .where("status", "=", "pending",)
    .where("next_attempt_at", "<=", toDate(nowMs,).toISOString(),)
    .orderBy("next_attempt_at",)
    .limit(opts.batch ?? OUTBOX_BATCH_SIZE,)
    .execute();

  const summary: MeshOutboxPassSummary = { checked: due.length, delivered: 0, retried: 0, dead: 0, };
  for (const row of due) {
    const envelope = parseEnvelope(row.envelope,);
    let delivered = false;
    if (envelope !== null) {
      try {
        // Re-reserve on every drain attempt: reservations are TTL-bound
        // (DEFAULT_RESERVATION_TTL_MS = 10 min) while the backoff schedule
        // (base * 2^attempts) outlives the original grant well before the
        // later attempts, and /api/mesh-deliver rejects a missing
        // reservationId with 400. A fresh grant also re-checks capacity.
        const granted = await requestReservation(post, row.target_origin, {
          senderOrigin: envelope.origin,
          contentHash: envelope.hash,
          sizeBytes: envelope.size,
          contentType: envelope.type,
        },);

        await pushEnvelope(post, row.target_origin, envelope, granted.reservationId,);
        delivered = true;
      } catch {
        // Peer unreachable, out of capacity, or refusing; the row falls
        // through to the same backoff/dead-letter accounting as a push
        // failure — a failed reserve is never counted as a delivery.
      }
    }

    if (delivered) {
      summary.delivered += 1;
      await database
        .updateTable("mesh_outbox",)
        .set({ status: "done", },)
        .where("id", "=", row.id,)
        .execute();

      continue;
    }

    const attempts = row.attempts + 1;
    if (attempts >= maxAttempts) {
      summary.dead += 1;
      await database
        .updateTable("mesh_outbox",)
        .set({ status: "dead", attempts, },)
        .where("id", "=", row.id,)
        .execute();
    } else {
      summary.retried += 1;
      await database
        .updateTable("mesh_outbox",)
        .set({
          attempts,
          next_attempt_at: toDate(nowMs + baseBackoffMs * 2 ** (attempts - 1),).toISOString(),
        },)
        .where("id", "=", row.id,)
        .execute();
    }
  }

  return summary;
}
