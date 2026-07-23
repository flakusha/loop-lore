/**
 * JWT module — HMAC-SHA256 signed JSON Web Tokens.
 *
 * Uses Web Crypto API (same as src/crypto/). No external dependencies.
 * Token format: HS256 (HMAC-SHA256) with standard JOSE headers.
 */

import { getLogger, } from "../logger/index";
import { jsonParseOr, } from "../utils";

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

async function importSecretKey(secret: string,): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(encoder.encode(secret,),),
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
  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header,),),);
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(payload,),),);
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
    const payload = jsonParseOr<JwtPayload>(payloadStr, {} as JwtPayload,);

    // Check expiration
    const now = Math.floor(Date.now() / 1000,);
    if (payload.exp < now) {
      return { valid: false, error: "Token expired", };
    }

    return { valid: true, payload, };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    getLog()?.warn("JWT verification failed", { error: msg, },);
    return { valid: false, error: `Verification failed: ${msg}`, };
  }
}
