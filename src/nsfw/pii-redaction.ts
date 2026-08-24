// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW PII redaction helpers.
 *
 * Shared by:
 *   - `src/middleware/nsfw-gate/logging.ts` (gate decision audit logs)
 *   - `src/nsfw/moderation-service/audit.ts` (user-facing notification bodies)
 *
 * Two contracts in one place so both tickets share the same privacy posture:
 *
 *   1. `NsfwGateReason` — closed enum for gate-decision reasons. Free-form
 *      `reason` strings are collapsed to a severity bucket so admin-internal
 *      detail never lands in `log_entries` or notification bodies.
 *   2. `hashId` — HMAC-SHA256 of an identifier (user id / chat id / actor id)
 *      keyed by a server-side secret via `crypto.subtle` (WebCrypto). Stable
 *      for correlation across rows, but unrecoverable without the secret.
 *      Salted; rotate the secret to invalidate all hashes.
 *   3. `applyNsfwMetadataRedaction` — strips known-PII keys from
 *      `Record<string, unknown>` so prompt fragments and message bodies
 *      never ride along with audit metadata.
 *
 * The 500-char body cap on user-facing notifications is enforced inline in
 * `audit.ts` (per ticket), not here.
 */
import { jsonStringifyOr, } from "../utils/safe-json";

/**
 * Closed enum of NSFW gate decision reasons. Replaces the free-form
 * `reason: string` surface so admin-internal case-detail text never
 * reaches the audit log or user notification.
 *
 * Sourced from `src/chat/types/nsfw.ts` `NsfwAuditEventType` plus the
 * downstream moderation actions.
 */
export const NSFW_GATE_REASONS = [
  "consent_missing",
  "rating_exceeded",
  "blocked_by_chat",
  "blocked_by_world",
  "blocked_by_user_pref",
  "explicit_content_detected",
  "user_override_disabled",
  "admin_emergency_block",
] as const;
export type NsfwGateReason = typeof NSFW_GATE_REASONS[number];

/** Type guard for `NsfwGateReason`. */
export function isNsfwGateReason(value: unknown,): value is NsfwGateReason {
  return typeof value === "string" && (NSFW_GATE_REASONS as readonly string[]).includes(value,);
}

/**
 * Server-side HMAC secret. Read from env; falls back to a build-time
 * default for local/dev only — production MUST set `NSFW_PII_SECRET`.
 */
const NSFW_PII_SECRET = process.env["NSFW_PII_SECRET"] ?? "nsfw-pii-dev-secret-do-not-use-in-prod";

/** Workaround for Bun's Uint8Array generics vs Web Crypto BufferSource. */
function toBufferSource(arr: Uint8Array,): Uint8Array<ArrayBuffer> {
  return arr as unknown as Uint8Array<ArrayBuffer>;
}

/**
 * Lazily-imported HMAC key for `NSFW_PII_SECRET`. WebCrypto's `sign()`
 * requires an async key, but every call site of `hashId` is sync — we
 * cache the imported key the first time `hashId` runs and reuse it.
 */
let hmacKeyPromise: Promise<CryptoKey> | null = null;
function getHmacKey(): Promise<CryptoKey> {
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      toBufferSource(new TextEncoder().encode(NSFW_PII_SECRET,),),
      { name: "HMAC", hash: "SHA-256", },
      false,
      ["sign",],
    );
  }
  return hmacKeyPromise;
}

/** Max allowed size of redacted metadata payloads (1 KiB). */
export const NSFW_METADATA_MAX_BYTES = 1024;

/**
 * HMAC-SHA256 hash of an identifier. Stable across calls (same input →
 * same output) so audit rows can be grouped, but unrecoverable without
 * the secret. Salt-free per-key so rotation invalidates all hashes.
 *
 * Async because WebCrypto's HMAC `sign` is async; the key is cached
 * after the first call.
 */
export async function hashId(value: string,): Promise<string> {
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    toBufferSource(new TextEncoder().encode(value,),),
  );
  return [...new Uint8Array(signature,),]
    .map((b,) => b.toString(16,).padStart(2, "0",))
    .join("",);
}

/** Metadata keys that must NEVER land in the audit `meta` column. */
const PII_METADATA_KEYS = new Set<string>([
  "promptFragment",
  "userMessage",
  "contentText",
  "errorStack",
  "userContent",
  "chatContent",
  "messageBody",
],);

/**
 * Strip known-PII keys from a metadata record; allowlist everything else.
 * Caps the serialized payload at `NSFW_METADATA_MAX_BYTES`. Returns a new
 * object; never mutates the input.
 *
 * Also strips any key whose name ends in `Content`, `Message`, or `Text`
 * (case-insensitive) — same family of fields, different naming.
 */
export function applyNsfwMetadataRedaction(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") { return {}; }
  const out: Record<string, unknown> = {};
  for (const [key, value,] of Object.entries(metadata,)) {
    if (PII_METADATA_KEYS.has(key,)) { continue; }
    if (/(Content|Message|Text)$/i.test(key,)) { continue; }
    if (typeof value === "string" && value.length > 256) { continue; }
    out[key] = value;
  }
  const serialized = jsonStringifyOr(out,);
  if (serialized.length <= NSFW_METADATA_MAX_BYTES) { return out; }
  return { _truncated: true, originalKeys: Object.keys(out,), };
}

/**
 * Canned notification bodies (mirror of `titles`). Keeps admin-internal
 * `reason` text out of the user-facing surface while still surfacing a
 * meaningful message for every known action.
 */
export const NSFW_USER_BODIES: Record<string, string> = {
  block: "You can no longer interact with NSFW content.",
  unblock: "Your NSFW access has been restored.",
  ban: "You are banned from NSFW content.",
  unban: "Your NSFW ban has been lifted.",
  shadow: "Some of your NSFW interactions have been limited.",
  unshadow: "Your NSFW access restrictions have been lifted.",
};

/** Hard cap on the user-facing `notifications.body` length. */
export const NOTIFICATION_BODY_MAX_CHARS = 500;

/**
 * Build the user-facing notification body. Prefers the canned map; falls
 * back to a generic template. Always trimmed and capped.
 *
 * `adminReason` is intentionally ignored — admin case-detail text never
 * reaches the user. (If a future feature needs `user_visible: true`
 * short reasons, it should set `reasonOverride` explicitly.)
 */
export function buildUserNotificationBody(
  actionType: string,
  _adminReason: string,
  reasonOverride?: string,
): string {
  const canned = NSFW_USER_BODIES[actionType];
  const body = reasonOverride?.trim() || canned || `Your NSFW access has been updated.`;
  return body.length > NOTIFICATION_BODY_MAX_CHARS ? body.slice(0, NOTIFICATION_BODY_MAX_CHARS,) : body;
}
