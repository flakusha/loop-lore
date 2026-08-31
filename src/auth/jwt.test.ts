// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for src/auth/jwt.ts.
 *
 * Covers the hardening introduced for security tickets:
 *   - verifyJwt rejects claimless/malformed payloads (was: coerced to {})
 *   - verifyJwt rejects missing or non-finite exp (was: never expired)
 *   - verifyJwt rejects missing sub/role/sid
 *   - signature check is still the gate (raw-token bypass blocked)
 */

import { describe, expect, test, } from "bun:test";
import { DOMAIN_INFO, domainKey, } from "../utils/hkdf";
import { signJwt, verifyJwt, } from "./jwt";

const SECRET = "test-secret-must-be-at-least-32-chars-long-aaaa";
const USER = "user-1";
const ROLE = "user";
const SID = "session-1";

/**
 * @param value
 */
function base64urlEncode(value: string,): string {
  const bytes = new TextEncoder().encode(value,);
  const b64 = btoa(String.fromCharCode(...bytes,),).replaceAll("+", "-",).replaceAll("/", "_",).replace(/=+$/, "",);
  return b64;
}

/**
 * @param headerB64
 * @param payloadB64
 * @param secret
 */
async function signRaw(headerB64: string, payloadB64: string, secret: string,): Promise<string> {
  const encoder = new TextEncoder();
  // Match `verifyJwt`'s key derivation so the signature check passes; the
  // payload-level assertions below are what these tests actually exercise.
  const subkey = await domainKey(secret, DOMAIN_INFO.JWT_SIGNING, 32,);
  const key = await crypto.subtle.importKey(
    "raw",
    subkey as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256", },
    false,
    ["sign",],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerB64}.${payloadB64}`,),);
  const sigBytes = new Uint8Array(sig,);
  const sigB64 = btoa(String.fromCharCode(...sigBytes,),).replaceAll("+", "-",).replaceAll("/", "_",).replace(
    /=+$/,
    "",
  );
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

/**
 * @param payloadJson
 */
async function tokenWithPayload(payloadJson: string,): Promise<string> {
  const headerB64 = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT", },),);
  const payloadB64 = base64urlEncode(payloadJson,);
  return signRaw(headerB64, payloadB64, SECRET,);
}

describe("verifyJwt — signature gate", () => {
  test("accepts a valid signed token", async () => {
    const token = await signJwt({
      secret: SECRET,
      userId: USER,
      role: ROLE,
      sessionId: SID,
      expiresInSeconds: 3600,
    },);
    const result = await verifyJwt({ secret: SECRET, token, },);
    expect(result.valid,).toBe(true,);
  });

  test("rejects when secret is wrong (signature mismatch)", async () => {
    const token = await signJwt({
      secret: SECRET,
      userId: USER,
      role: ROLE,
      sessionId: SID,
      expiresInSeconds: 3600,
    },);
    const result = await verifyJwt({
      secret: "wrong-secret-must-be-at-least-32-chars-bbbb",
      token,
    },);
    expect(result.valid,).toBe(false,);
  });

  test("rejects when token is not three parts", async () => {
    const result = await verifyJwt({ secret: SECRET, token: "not-a-jwt", },);
    expect(result.valid,).toBe(false,);
  });

  test("rejects when signature was tampered with", async () => {
    const token = await signJwt({
      secret: SECRET,
      userId: USER,
      role: ROLE,
      sessionId: SID,
      expiresInSeconds: 3600,
    },);
    // Flip a byte in the middle of the signature.
    const sigStart = token.lastIndexOf(".",) + 1;
    const mid = sigStart + Math.floor((token.length - sigStart) / 2,);
    const sigChar = token.charAt(mid,);
    const sigFlip = sigChar === "A" ? "B" : "A";
    const tampered = token.slice(0, mid,) + sigFlip + token.slice(mid + 1,);
    const result = await verifyJwt({ secret: SECRET, token: tampered, },);
    expect(result.valid,).toBe(false,);
  });
});

describe("verifyJwt — payload hardening (regression)", () => {
  test("rejects when payload is not valid JSON", async () => {
    const token = await tokenWithPayload("not-json-at-all",);
    const result = await verifyJwt({ secret: SECRET, token, },);
    expect(result.valid,).toBe(false,);
    if (!result.valid) {
      expect(result.error,).toBe("Invalid payload",);
    }
  });

  test("rejects when payload JSON is an array (not object)", async () => {
    const token = await tokenWithPayload("[1,2,3]",);
    const result = await verifyJwt({ secret: SECRET, token, },);
    expect(result.valid,).toBe(false,);
    if (!result.valid) {
      expect(result.error,).toBe("Invalid payload",);
    }
  });

  test("rejects when sub claim is missing", async () => {
    const future = Math.floor(Date.now() / 1000,) + 3600;
    const token = await tokenWithPayload(JSON.stringify({
      role: "user",
      sid: "x",
      iat: 0,
      exp: future,
    },),);
    const result = await verifyJwt({ secret: SECRET, token, },);
    expect(result.valid,).toBe(false,);
    if (!result.valid) {
      expect(result.error,).toBe("Missing required claims",);
    }
  });

  test("rejects when sid claim is missing", async () => {
    const future = Math.floor(Date.now() / 1000,) + 3600;
    const token = await tokenWithPayload(JSON.stringify({
      sub: "user-x",
      role: "user",
      iat: 0,
      exp: future,
    },),);
    const result = await verifyJwt({ secret: SECRET, token, },);
    expect(result.valid,).toBe(false,);
    if (!result.valid) {
      expect(result.error,).toBe("Missing required claims",);
    }
  });

  test("rejects when exp claim is missing", async () => {
    const token = await tokenWithPayload(JSON.stringify({
      sub: USER,
      role: ROLE,
      sid: SID,
      iat: 0,
    },),);
    const result = await verifyJwt({ secret: SECRET, token, },);
    expect(result.valid,).toBe(false,);
    if (!result.valid) {
      expect(result.error,).toBe("Missing or invalid exp claim",);
    }
  });

  test("rejects when exp is a string instead of a number", async () => {
    const token = await tokenWithPayload(JSON.stringify({
      sub: USER,
      role: ROLE,
      sid: SID,
      iat: 0,
      exp: "9999999999",
    },),);
    const result = await verifyJwt({ secret: SECRET, token, },);
    expect(result.valid,).toBe(false,);
    if (!result.valid) {
      expect(result.error,).toBe("Missing or invalid exp claim",);
    }
  });

  test("rejects when exp is in the past", async () => {
    const token = await signJwt({
      secret: SECRET,
      userId: USER,
      role: ROLE,
      sessionId: SID,
      expiresInSeconds: -10,
    },);
    const result = await verifyJwt({ secret: SECRET, token, },);
    expect(result.valid,).toBe(false,);
    if (!result.valid) {
      expect(result.error,).toBe("Token expired",);
    }
  });
});
