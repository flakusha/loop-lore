// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/sharing.ts — reservation lifecycle + delivery with
// last-writer-wins conflict handling. Envelope crypto lives in ./envelope.
//
// Reservations live on the RECEIVING side: the sender requests capacity via
// `requestReservation` (POST /api/mesh-reserve), pushes the envelope, and the
// receiver confirms on store. Capacity is per-peer (`capacity_bytes`, NULL =
// unlimited); dynamic quota negotiation stays a follow-up.

import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DuplicationPolicy, WorldDuplicationPolicy, } from "../config/schema";
import type { DB, } from "../db/schema";
import { type ContentCipher, pskCipher, } from "./cipher";
import { type ContentEnvelope, openEnvelope, sealContent, } from "./envelope";
import { canonicalOrigin, type PeerPost, } from "./peer-fetch";

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

/**
 * Granted reservation: capacity id plus the receiver's inbound content key
 * for this sender (absent when the receiver runs PSK-only without an SMK).
 */
export interface GrantedReservation {
  /** Receiver-side reservation id. */
  reservationId: string;
  /** Base64 inbound key to seal with (via `pskCipher`). Omitted on PSK fallback. */
  contentKey?: string;
}

/**
 * Request capacity on a receiving peer (sender side). The response carries
 * the receiver's inbound content key for this sender — seal the push with
 * it instead of the mesh PSK whenever present.
 * @param post Transport POST.
 * @param origin Receiver origin.
 * @param request Reservation request.
 * @returns Reservation id plus optional inbound content key.
 * @throws When the peer refuses or is unreachable.
 */
export async function requestReservation(
  post: PeerPost,
  origin: string,
  request: {
    senderOrigin: string;
    contentHash: string;
    sizeBytes: number;
    contentType?: string;
    ttlMs?: number;
  },
): Promise<GrantedReservation> {
  const response = await post(`${origin}/api/mesh-reserve`, {
    senderOrigin: request.senderOrigin,
    contentHash: request.contentHash,
    sizeBytes: request.sizeBytes,
    contentType: request.contentType ?? "blob",
    ttlMs: request.ttlMs ?? DEFAULT_RESERVATION_TTL_MS,
  },);
  const body = (response.body ?? null) as { reservationId?: unknown; contentKey?: unknown } | null;
  const reservationId = body?.reservationId;
  if (!response.ok || typeof reservationId !== "string") {
    throw new Error(`reservation refused by ${origin} (status ${response.status})`,);
  }
  const contentKey = body?.contentKey;
  return {
    reservationId,
    ...(typeof contentKey === "string" ? { contentKey, } : {}),
  };
}

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

/**
 * Effective duplication policy for one push: the per-world override when the
 * push carries a known world id, otherwise the top-level policy.
 * @param policy Configured duplication policy.
 * @param worldId World id carried by the push, if any.
 */
export function resolveDuplicationPolicy(
  policy: DuplicationPolicy,
  worldId?: string,
): WorldDuplicationPolicy {
  if (worldId !== undefined) {
    const override = policy.worlds?.[worldId];
    if (override !== undefined) { return override; }
  }
  return policy;
}

/**
 * Duplication targets under the configured policy, excluding one origin.
 * `trusted` fans out to every trusted peer; `listed` intersects the
 * configured peers with the trusted set; `none` disables duplication.
 * A push carrying a world id uses that world's override when configured.
 * @param database
 * @param policy
 * @param except Origin to exclude (usually the push source).
 * @param worldId World id carried by the push, if any.
 */
export async function selectDuplicationTargets(
  database: Kysely<DB>,
  policy: DuplicationPolicy,
  except?: string,
  worldId?: string,
): Promise<string[]> {
  const effective = resolveDuplicationPolicy(policy, worldId,);
  if (effective.mode === "none") { return []; }
  const rows = await database
    .selectFrom("mesh_peers",)
    .select(["origin",],)
    .where("state", "=", "trusted",)
    .orderBy("origin",)
    .execute();
  const trusted = new Set(rows.map((row,) => row.origin),);
  const candidates = effective.mode === "listed"
    ? effective.peers.map((raw,) => canonicalOrigin(raw,))
    : [...trusted,];
  return candidates.filter((origin,): origin is string => origin !== null && origin !== except && trusted.has(origin,));
}

/**
 * Content to replicate to duplication targets.
 */
export interface FanOutContent {
  /** Stable content id (shared across retries/duplicates). */
  id: string;
  /** Plaintext payload. */
  content: Uint8Array | string;
  /** Content type label. */
  contentType?: string;
  /** World id for per-world duplication overrides. */
  worldId?: string;
  /** Sender wall-clock ms (defaults to now). */
  clock?: number;
}

/** One target that did not receive the content. */
export interface FanOutFailure {
  /** Target origin. */
  origin: string;
  /** Reserve, seal, or push error message. */
  error: string;
}

/** Per-target outcome of one fan-out pass. */
export interface FanOutResult {
  /** Targets attempted (trusted, policy-selected, self excluded). */
  targets: string[];
  /** Targets that stored the content. */
  stored: string[];
  /** Targets that already held newer content. */
  stale: string[];
  /** Targets that failed at any step. */
  failed: FanOutFailure[];
}

/**
 * Replicate content to every duplication target: reserve, seal (with the
 * receiver's inbound key when issued, else the mesh PSK), push. Targets
 * are independent — one target's failure never blocks the others.
 * Reservations left open by a failed push expire via the sweep; there is
 * no sender-side release route.
 * @param database Sender database handle (peer registry + policy read).
 * @param post Transport POST (bind peer TLS trust before passing).
 * @param senderOrigin This instance's canonical origin.
 * @param policy Configured duplication policy.
 * @param psk Mesh PSK cipher (probe seal + fallback).
 * @param content Payload to replicate.
 */
export async function fanOutContent(
  database: Kysely<DB>,
  post: PeerPost,
  senderOrigin: string,
  policy: DuplicationPolicy,
  psk: ContentCipher,
  content: FanOutContent,
): Promise<FanOutResult> {
  const type = content.contentType ?? "blob";
  const clock = content.clock ?? Date.now();
  // Probe seal for hash/size (hash covers plaintext, key-independent).
  const probe = await sealContent({
    id: content.id,
    origin: senderOrigin,
    clock,
    type,
    content: content.content,
    cipher: psk,
  },);
  const targets = await selectDuplicationTargets(database, policy, senderOrigin, content.worldId,);
  const settled = await Promise.allSettled(targets.map(async (target,) => {
    const granted = await requestReservation(post, target, {
      senderOrigin,
      contentHash: probe.hash,
      sizeBytes: probe.size,
      contentType: type,
    },);
    const cipher = granted.contentKey !== undefined ? pskCipher(granted.contentKey,) : psk;
    const envelope = await sealContent({
      id: content.id,
      origin: senderOrigin,
      clock,
      type,
      content: content.content,
      cipher,
    },);
    const verdict = await pushEnvelope(post, target, envelope, granted.reservationId,);
    return { target, verdict, };
  },),);
  const result: FanOutResult = { targets, stored: [], stale: [], failed: [], };
  for (const [index, outcome,] of settled.entries()) {
    const target = targets[index]!;
    if (outcome.status === "fulfilled") {
      result[outcome.value.verdict === "stored" ? "stored" : "stale"].push(target,);
    } else {
      const error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason,);
      result.failed.push({ origin: target, error, },);
    }
  }
  return result;
}
