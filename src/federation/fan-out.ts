// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/fan-out.ts — sender replication to duplication targets.
//
// Per target: reserve capacity, seal (with the receiver's inbound key when
// issued, else the mesh PSK), push. Targets are independent — one target's
// failure never blocks the others. Targets whose coordinator-known
// capacity cannot fit the payload are skipped before any network attempt.
// Reservations left open by a failed push expire via the sweep; there is
// no sender-side release route.

import type { Kysely, } from "kysely";
import type { DuplicationPolicy, } from "../config/schema";
import type { DB, } from "../db/schema";
import { pushEnvelope, } from "./delivery";
import {
  type FanOutSkip,
  selectDuplicationTargets,
  selectTargetsWithCapacity,
} from "./duplication";
import { type MeshEncryptionProvider, } from "./encryption";
import { sealContent, } from "./envelope";
import { type PeerPost, } from "./peer-fetch";
import { DEFAULT_RESERVATION_TTL_MS, } from "./sharing";

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
  /** Targets attempted (trusted, policy-selected, capacity-fitting, self excluded). */
  targets: string[];
  /** Targets that stored the content. */
  stored: string[];
  /** Targets that already held newer content. */
  stale: string[];
  /** Targets that failed at any step. */
  failed: FanOutFailure[];
  /** Targets skipped before any network attempt (known capacity too small). */
  skipped: FanOutSkip[];
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

/**
 * Replicate content to every duplication target: reserve, seal (with the
 * receiver's inbound key when issued, else the mesh PSK), push.
 * @param database Sender database handle (peer registry + policy read).
 * @param post Transport POST (bind peer TLS trust before passing).
 * @param senderOrigin This instance's canonical origin.
 * @param policy Configured duplication policy.
 * @param encryption Cipher selection (probe seal + per-target content keys).
 * @param content Payload to replicate.
 */
export async function fanOutContent(
  database: Kysely<DB>,
  post: PeerPost,
  senderOrigin: string,
  policy: DuplicationPolicy,
  encryption: MeshEncryptionProvider,
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
    cipher: encryption.psk,
  },);
  const candidates = await selectDuplicationTargets(database, policy, senderOrigin, content.worldId,);
  const fit = await selectTargetsWithCapacity(database, candidates, probe.size,);
  const settled = await Promise.allSettled(fit.targets.map(async (target,) => {
    const granted = await requestReservation(post, target, {
      senderOrigin,
      contentHash: probe.hash,
      sizeBytes: probe.size,
      contentType: type,
    },);
    const cipher = encryption.contentCipher(granted.contentKey,);
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
  const result: FanOutResult = { targets: fit.targets, stored: [], stale: [], failed: [], skipped: fit.skipped, };
  for (const [index, outcome,] of settled.entries()) {
    const target = fit.targets[index]!;
    if (outcome.status === "fulfilled") {
      result[outcome.value.verdict === "stored" ? "stored" : "stale"].push(target,);
    } else {
      const error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason,);
      result.failed.push({ origin: target, error, },);
    }
  }
  return result;
}
