// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Advisory mesh intel (design §7, S3): pure validation + shared-PSK HMAC.
 * A valid proof is mesh-wide provenance, not per-peer attribution. Records
 * are stored and audited only — no block, no auto-apply, no caller-supplied
 * authority.
 */
import { meshHmacHex, verifyMeshHmacHex, } from "../federation/mesh-proof";
import { safeJsonStringify, } from "../utils";
import { toDate, } from "../utils/date";

/** Peer reports carry labels, never proof of a compromise. */
export const INTEL_TYPES = ["suspicion",] as const;
/** Type of an accepted peer report. */
export type IntelType = (typeof INTEL_TYPES)[number];

/** Delist removes this peer's matching rows; report adds a row. */
export const INTEL_ACTIONS = ["delist", "report",] as const;
/** Action of an accepted peer report. */
export type IntelAction = (typeof INTEL_ACTIONS)[number];

/** Hard ceiling on a serialized feed body. */
export const MAX_FEED_BYTES = 64 * 1024;
/** Hard ceiling on entries in one push. */
export const MAX_FEED_ENTRIES = 100;
/** Maximum TTL of one record (48h, matching a short blocklist window). */
export const MAX_TTL_MS = 48 * 60 * 60 * 1000;
/** Maximum age of a pushed record. */
export const MAX_AGE_MS = 5 * 60 * 1000;
/** Allowed clock skew into the future. */
export const MAX_SKEW_MS = 60 * 1000;
/** Maximum active records accepted from one peer. */
export const MAX_PER_PEER = 500;

/** One peer report on the wire and in the local reports table. */
export interface IntelRecord {
  readonly action: IntelAction;
  readonly confidence: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** Digest-form key; never a raw IP or other PII. */
  readonly indicator: string;
  /** Replay key, unique per report. */
  readonly nonce: string;
  /** Canonical origin, checked against the authenticated peer. */
  readonly sourcePeer: string;
  readonly type: IntelType;
}

/** Signed feed material. */
export interface IntelFeed {
  readonly origin: string;
  readonly records: readonly IntelRecord[];
}

/** Wire shape: material plus its HMAC proof. */
export interface IntelFeedRequest extends IntelFeed {
  readonly proof: string;
}

/** Parse result: validated feed + proof, or a stable error message. */
export type IntelParseResult =
  | { ok: true; feed: IntelFeed; proof: string }
  | { ok: false; error: string };

/**
 * Canonical bytes signed for a push. Fixed field order; proof excluded.
 * @param feed
 * @returns deterministic JSON string
 */
export function intelMaterial(feed: IntelFeed,): string {
  const result = safeJsonStringify({
    origin: feed.origin,
    records: feed.records.map((record,) => ({
      action: record.action,
      confidence: record.confidence,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      indicator: record.indicator,
      nonce: record.nonce,
      sourcePeer: record.sourcePeer,
      type: record.type,
    })),
  },);

  return result.ok ? result.value : "";
}

/**
 * Canonical bytes signed for a delta pull.
 * @param origin
 * @param since ISO cursor, omitted for a full pull
 * @returns deterministic JSON string
 */
export function intelPullMaterial(origin: string, since?: string,): string {
  const result = safeJsonStringify({ origin, since: since ?? null, },);
  return result.ok ? result.value : "";
}

/**
 * Sign feed material with the shared mesh PSK.
 * @param secret config.federation.meshPsk
 * @param feed
 * @returns hex HMAC-SHA256
 */
export async function signIntelFeed(secret: string, feed: IntelFeed,): Promise<string> {
  return meshHmacHex(secret, intelMaterial(feed,),);
}

/**
 * Sign a delta-pull request with the shared mesh PSK.
 * @param secret config.federation.meshPsk
 * @param origin
 * @param since ISO cursor
 * @returns hex HMAC-SHA256
 */
export async function signIntelPull(
  secret: string,
  origin: string,
  since?: string,
): Promise<string> {
  return meshHmacHex(secret, intelPullMaterial(origin, since,),);
}

/**
 * Constant-time proof check.
 * @param secret config.federation.meshPsk
 * @param material canonical bytes
 * @param proof claimed hex digest
 * @returns true when the proof matches
 */
export async function verifyIntelProof(
  secret: string,
  material: string,
  proof: unknown,
): Promise<boolean> {
  return verifyMeshHmacHex(secret, material, proof,);
}

/**
 * @param error
 * @returns failed parse result
 */
function fail(error: string,): IntelParseResult {
  return { error, ok: false, };
}

/**
 * @param value
 * @param nowMs
 * @returns a validated record or null
 */
function parseRecord(value: unknown, nowMs: number,): IntelRecord | null {
  if (!value || typeof value !== "object") { return null; }
  const record = value as Record<string, unknown>;
  if (
    record.action !== "report" && record.action !== "delist" ||
    record.type !== "suspicion" ||
    typeof record.indicator !== "string" || record.indicator.length === 0 ||
    record.indicator.length > 200 ||
    !/^[a-z][a-z0-9_-]*:[a-f0-9]{8,64}(:[a-z0-9_-]+)?$/i.test(record.indicator,) ||
    typeof record.nonce !== "string" || record.nonce.length === 0 ||
    record.nonce.length > 128 ||
    !/^[a-z0-9_-]+$/i.test(record.nonce,) ||
    typeof record.sourcePeer !== "string" || record.sourcePeer.length === 0 ||
    record.sourcePeer.length > 300 ||
    typeof record.confidence !== "number" ||
    !Number.isFinite(record.confidence,) ||
    record.confidence < 0 || record.confidence > 1 ||
    typeof record.createdAt !== "string" || typeof record.expiresAt !== "string"
  ) { return null; }

  const created = toDate(record.createdAt,);
  const expires = toDate(record.expiresAt,);
  const createdMs = created.getTime();
  const expiresMs = expires.getTime();
  if (
    Number.isNaN(createdMs,) || Number.isNaN(expiresMs,) ||
    createdMs < nowMs - MAX_AGE_MS || createdMs > nowMs + MAX_SKEW_MS ||
    expiresMs <= nowMs || expiresMs - createdMs > MAX_TTL_MS
  ) { return null; }

  return {
    action: record.action,
    confidence: record.confidence,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    indicator: record.indicator,
    nonce: record.nonce,
    sourcePeer: record.sourcePeer,
    type: record.type,
  };
}

/**
 * Validate a bounded push body. No trust decision happens here.
 * @param body parsed JSON body
 * @param now injected clock (tests)
 * @returns validated feed + proof, or an error message
 */
export function parseIntelFeed(body: unknown, now = new Date(),): IntelParseResult {
  const serialized = safeJsonStringify(body,);
  if (!serialized.ok || serialized.value.length > MAX_FEED_BYTES) {
    return fail("feed too large or not serializable",);
  }

  if (!body || typeof body !== "object") { return fail("invalid feed",); }

  const request = body as { origin?: unknown; records?: unknown; proof?: unknown };
  if (
    typeof request.origin !== "string" || request.origin.length === 0 ||
    request.origin.length > 300 ||
    !Array.isArray(request.records,) || request.records.length === 0 ||
    request.records.length > MAX_FEED_ENTRIES ||
    typeof request.proof !== "string" || request.proof.length !== 64
  ) { return fail("invalid feed envelope",); }

  const nowMs = now.getTime();
  const records: IntelRecord[] = [];
  for (const value of request.records) {
    const record = parseRecord(value, nowMs,);
    if (!record) { return fail("invalid intel record",); }
    records.push(record,);
  }

  return { feed: { origin: request.origin, records, }, ok: true, proof: request.proof, };
}
