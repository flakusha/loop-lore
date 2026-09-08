// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — signed URL generation + verification.
 *
 * Signed URLs allow an asset's raw/download/thumb/compressed endpoints to be
 * served to a requester who holds a valid, time-limited HMAC token, without
 * requiring a fresh authenticated session on every request. This powers the
 * in-chat asset preview + linkage side panel (Item 7) and prevents direct
 * enumeration of the serve endpoints.
 *
 * A signed URL looks like:
 *   /api/assets/:id/raw?expires=<epochMs>&sig=<base64url(HMAC)>
 *
 * The signature is HMAC-SHA256 over the string `${action}:${assetId}:${expiresAtMs}`,
 * base64url-encoded. Tokens are bound to a single asset + serve action and
 * expire at `expiresAtMs`. Verification is constant-time.
 *
 * Uses the Web Crypto API (same as src/auth/jwt.ts). No external deps.
 */

import { getLogger, } from "../../logger/index";
import { fromBase64, toBase64, } from "../../utils/base64";
import { DOMAIN_INFO, domainKey, } from "../../utils/hkdf";

const SIGNED_URL_ACTIONS = ["raw", "download", "thumb", "compressed",] as const;
/** */
export type SignedUrlAction = (typeof SIGNED_URL_ACTIONS)[number];

/**
 * @param value
 */
export function isSignedUrlAction(value: string,): value is SignedUrlAction {
  return (SIGNED_URL_ACTIONS as readonly string[]).includes(value,);
}

let _log: ReturnType<typeof getLogger> | null = null;
/** */
function getLog() {
  try {
    _log ??= getLogger().child({ module: "assets/signed-url", },);
    return _log;
  } catch {
    return null;
  }
}

// ── Base64url helpers (mirror src/auth/jwt.ts) ──────────────────

/**
 * @param data
 */
function base64urlEncode(data: Uint8Array,): string {
  return toBase64(data,).replaceAll("+", "-",).replaceAll("/", "_",).replace(/=+$/, "",);
}

/**
 * @param str
 */
function base64urlDecode(str: string,): Uint8Array {
  const base64 = str.replaceAll("-", "+",).replaceAll("_", "/",);
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4,);
  return fromBase64(padded,);
}

/**
 * Workaround for Bun's Uint8Array generics vs Web Crypto BufferSource.
 * @param arr
 */
function toBufferSource(arr: Uint8Array,): Uint8Array<ArrayBuffer> {
  return arr as unknown as Uint8Array<ArrayBuffer>;
}

/**
 * Derive the asset signed-URL HMAC key from the resolved secret.
 *
 * SECURITY (BUG-jwtsecret-reused-across-three-security-domains): when the
 * caller falls back to `auth.jwtSecret` (via `resolveSignedUrlSecret`), the
 * same upstream secret is consumed here, by `src/auth/jwt.ts`, and by
 * `src/nsfw/pii-redaction.ts`. HKDF-SHA256 with a domain-specific info
 * keeps the resulting HMAC keys independent.
 * @param secret
 */
async function importSecretKey(secret: string,): Promise<CryptoKey> {
  const subkey = await domainKey(secret, DOMAIN_INFO.ASSETS_SIGNED_URL, 32,);
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(subkey,),
    { name: "HMAC", hash: "SHA-256", },
    false,
    ["sign", "verify",],
  );
}

/**
 * Constant-time compare of two byte arrays. Length mismatch short-circuits.
 * @param a
 * @param b
 */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array,): boolean {
  if (a.length !== b.length) { return false; }
  let diff = 0;
  for (const [i, byte,] of a.entries()) {
    diff |= byte ^ b[i]!;
  }
  return diff === 0;
}

// ── Public API ────────────────────────────────────────────────

/** */
export interface SignAssetUrlOpts {
  secret: string;
  assetId: string;
  action: SignedUrlAction;
  /** Lifetime in seconds from now. Defaults to 900 (15 min). */
  expiresInSeconds?: number;
  /** Injection point for deterministic tests. */
  now?: number;
}

/** */
export interface SignedUrlToken {
  /** base64url HMAC-SHA256 signature over `${action}:${assetId}:${expiresAt}`. */
  token: string;
  /** Expiry as epoch milliseconds. */
  expiresAt: number;
}

/**
 * Sign a time-limited URL token for an asset serve action.
 * @param opts
 * @returns Signed token + absolute expiry (ms epoch).
 */
export async function signAssetUrl(opts: SignAssetUrlOpts,): Promise<SignedUrlToken> {
  const now = opts.now ?? Date.now();
  const expiresInSec = opts.expiresInSeconds ?? 900;
  const expiresAt = now + expiresInSec * 1000;

  const encoder = new TextEncoder();
  const payload = `${opts.action}:${opts.assetId}:${expiresAt}`;
  const key = await importSecretKey(opts.secret,);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    toBufferSource(encoder.encode(payload,),),
  );

  getLog()?.debug("signed asset url", { assetId: opts.assetId, action: opts.action, expiresAt, },);
  return { token: base64urlEncode(new Uint8Array(signature,),), expiresAt, };
}

/** */
export interface VerifyAssetUrlOpts {
  secret: string;
  token: string;
  assetId: string;
  action: SignedUrlAction;
  /** Expiry (epoch ms) extracted from the signed URL query. */
  expiresAt: number;
  /** Injection point for deterministic tests. */
  now?: number;
}

/** */
export type SignedUrlVerifyResult =
  | { valid: true }
  | { valid: false; reason: "malformed" | "bad_signature" | "expired" };

/**
 * Verify a signed URL token for an asset + action at the given expiry.
 * Recomputes the HMAC over `${action}:${assetId}:${expiresAt}` and compares
 * constant-time; rejects on bad signature or expiry.
 * @param opts
 */
export async function verifyAssetUrl(opts: VerifyAssetUrlOpts,): Promise<SignedUrlVerifyResult> {
  if (!Number.isFinite(opts.expiresAt,)) {
    return { valid: false, reason: "malformed", };
  }

  try {
    const encoder = new TextEncoder();
    const payload = `${opts.action}:${opts.assetId}:${opts.expiresAt}`;
    const key = await importSecretKey(opts.secret,);
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      toBufferSource(encoder.encode(payload,),),
    );
    const expected = base64urlEncode(new Uint8Array(signature,),);

    if (!timingSafeEqualBytes(base64urlDecode(opts.token,), base64urlDecode(expected,),)) {
      return { valid: false, reason: "bad_signature", };
    }

    const now = opts.now ?? Date.now();
    if (opts.expiresAt <= now) {
      return { valid: false, reason: "expired", };
    }

    return { valid: true, };
  } catch {
    return { valid: false, reason: "malformed", };
  }
}

/**
 * Resolve the effective HMAC secret for signed URLs.
 * Prefers `assets.signedUrlSecret`; falls back to `auth.jwtSecret`.
 * Returns null when neither is configured — callers must fail closed.
 *
 * SECURITY (BUG-jwtsecret-reused-across-three-security-domains): when the
 * fallback path engages, the same `auth.jwtSecret` is consumed here AND by
 * `src/auth/jwt.ts` AND by `src/nsfw/pii-redaction.ts`. HKDF domain
 * separation makes the subkeys independent, but sharing the upstream
 * secret still concentrates blast radius. Emit a one-shot warn so the
 * operator knows to set `ASSETS_SIGNED_URL_SECRET` and stop sharing.
 * @param assetsSecret
 * @param jwtSecret
 */
export function resolveSignedUrlSecret(
  assetsSecret: string | undefined,
  jwtSecret: string | undefined,
): string | null {
  const hasAssets = !!(assetsSecret && assetsSecret.length > 0);
  const hasJwt = !!(jwtSecret && jwtSecret.length > 0);
  if (hasAssets) { return assetsSecret!; }
  if (hasJwt) {
    if (!_fallbackWarned) {
      _fallbackWarned = true;
      getLog()?.warn(
        "assets.signedUrlSecret is unset — falling back to auth.jwtSecret. " +
          "Set ASSETS_SIGNED_URL_SECRET to stop sharing one upstream secret " +
          "across JWT signing, asset URL signing, and PII pseudonymization.",
        { domains: ["jwt-sign", "assets-signed-url", "nsfw-pii", "telemetry-pii",], },
      );
    }
    return jwtSecret!;
  }
  return null;
}

/** One-shot latch so the warn fires at most once per process. */
let _fallbackWarned = false;
