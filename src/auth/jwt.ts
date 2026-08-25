// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * JWT module — HMAC-SHA256 signed JSON Web Tokens.
 *
 * Uses Web Crypto API (same as src/crypto/). No external dependencies.
 * Token format: HS256 (HMAC-SHA256) with standard JOSE headers.
 */

import { getLogger, } from "../logger/index";
import { jsonStringifyOr, safeJsonParse, } from "../utils";
import { DOMAIN_INFO, domainKey, } from "../utils/hkdf";

let _log: ReturnType<typeof getLogger> | null = null;
function getLog() {
  try {
    _log ??= getLogger().child({ module: "auth/jwt", },);
    return _log;
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────

export interface JwtPayload {
  /** Subject (user ID) */
  sub: string;
  /** User role */
  role: string;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
  /** Session ID for revocation tracking */
  sid: string;
}

export interface JwtVerifyResult {
  valid: true;
  payload: JwtPayload;
}

export interface JwtVerifyError {
  valid: false;
  error: string;
}

export type JwtResult = JwtVerifyResult | JwtVerifyError;

export interface SignJwtOpts {
  secret: string;
  userId: string;
  role: string;
  sessionId: string;
  expiresInSeconds: number;
}

export interface VerifyJwtOpts {
  secret: string;
  token: string;
}

// ── Base64url helpers ─────────────────────────────────────────

function base64urlEncode(data: Uint8Array,): string {
  const bytes = Array.from(data,);
  const base64 = btoa(String.fromCharCode(...bytes,),);
  return base64.replaceAll("+", "-",).replaceAll("/", "_",).replace(/=+$/, "",);
}

function base64urlDecode(str: string,): Uint8Array {
  const base64 = str.replaceAll("-", "+",).replaceAll("_", "/",);
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4,);
  const binary = atob(padded,);
  const bytes = Array.from({ length: binary.length, }, (_, i,) => binary.charCodeAt(i,),);
  return new Uint8Array(bytes,);
}

// ── Crypto helpers ────────────────────────────────────────────

/** Workaround for Bun's Uint8Array generics vs Web Crypto BufferSource. */
function toBufferSource(arr: Uint8Array,): Uint8Array<ArrayBuffer> {
  return arr as unknown as Uint8Array<ArrayBuffer>;
}
/**
 * Derive the JWT-signing HMAC key from the shared auth secret.
 *
 * SECURITY (BUG-jwtsecret-reused-across-three-security-domains): the same
 * `auth.jwtSecret` is used here, by `src/assets/controller/signed-url.ts`,
 * and by `src/nsfw/pii-redaction.ts`. Domain-separating the consumers with
 * HKDF-SHA256 means a leak of one subkey cannot impersonate the others.
 */
async function importSecretKey(secret: string,): Promise<CryptoKey> {
  const subkey = await domainKey(secret, DOMAIN_INFO.JWT_SIGNING, 32,);
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(subkey,),
    { name: "HMAC", hash: "SHA-256", },
    false,
    ["sign", "verify",],
  );
}

// ── Public API ────────────────────────────────────────────────

/**
 * Sign a JWT token.
 *
 * @returns Signed JWT string (header.payload.signature)
 */
export async function signJwt(opts: SignJwtOpts,): Promise<string> {
  const header = { alg: "HS256", typ: "JWT", };
  const now = Math.floor(Date.now() / 1000,);
  const payload: JwtPayload = {
    sub: opts.userId,
    role: opts.role,
    iat: now,
    exp: now + opts.expiresInSeconds,
    sid: opts.sessionId,
  };

  const encoder = new TextEncoder();
  const headerB64 = base64urlEncode(encoder.encode(jsonStringifyOr(header, "{}",),),);
  const payloadB64 = base64urlEncode(encoder.encode(jsonStringifyOr(payload, "{}",),),);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importSecretKey(opts.secret,);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    toBufferSource(encoder.encode(signingInput,),),
  );

  const signatureB64 = base64urlEncode(new Uint8Array(signature,),);

  getLog()?.debug("JWT signed", { userId: opts.userId, sid: opts.sessionId, },);
  return `${signingInput}.${signatureB64}`;
}

/**
 * Verify and decode a JWT token.
 *
 * @returns JwtVerifyResult with payload or error
 */
export async function verifyJwt(opts: VerifyJwtOpts,): Promise<JwtResult> {
  const parts = opts.token.split(".",);
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid token format", };
  }

  const [headerB64, payloadB64, signatureB64,] = parts as [string, string, string,];

  try {
    const encoder = new TextEncoder();
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = base64urlDecode(signatureB64,);

    const key = await importSecretKey(opts.secret,);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature as unknown as ArrayBuffer,
      encoder.encode(signingInput,),
    );

    if (!valid) {
      return { valid: false, error: "Invalid signature", };
    }

    const payloadBytes = base64urlDecode(payloadB64,);
    const payloadStr = new TextDecoder().decode(payloadBytes,);
    // Defense-in-depth: a malformed payload must NOT silently coerce to {} —
    // an empty `{}` previously passed expiration check (`undefined < now` is
    // false) and was returned as `valid:true` with no `sub`/`sid`. Reject parse
    // failure outright; callers can then safely assume every valid token has
    // the full claim set.
    const parsed = safeJsonParse<JwtPayload>(payloadStr,);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value,)) {
      return { valid: false, error: "Invalid payload", };
    }
    const payload = parsed.value;

    // Required claims — token is useless without a subject, role, or session.
    if (
      typeof payload.sub !== "string" || payload.sub.length === 0 ||
      typeof payload.role !== "string" || payload.role.length === 0 ||
      typeof payload.sid !== "string" || payload.sid.length === 0
    ) {
      return { valid: false, error: "Missing required claims", };
    }

    // Finite, future-dated expiration. A token missing `exp` or with a
    // non-numeric value would otherwise be treated as never-expiring.
    if (
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp,)
    ) {
      return { valid: false, error: "Missing or invalid exp claim", };
    }
    const now = Math.floor(Date.now() / 1000,);
    if (payload.exp <= now) {
      return { valid: false, error: "Token expired", };
    }

    return { valid: true, payload, };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    getLog()?.warn("JWT verification failed", { error: msg, },);
    return { valid: false, error: `Verification failed: ${msg}`, };
  }
}
