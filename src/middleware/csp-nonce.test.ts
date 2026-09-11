// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for per-request CSP nonce storage. */
import { describe, expect, test, } from "bun:test";
import { generateNonce, getNonce, } from "./csp-nonce";

describe("csp-nonce", () => {
  test("getNonce returns null before generation", () => {
    const req = new Request("http://localhost/",);
    expect(getNonce(req,),).toBeNull();
  });

  test("generateNonce stores and returns the same nonce", () => {
    const req = new Request("http://localhost/",);
    const nonce = generateNonce(req,);
    expect(nonce.length,).toBeGreaterThan(0,);
    expect(getNonce(req,),).toBe(nonce,);
  });

  test("nonces are isolated per request", () => {
    const a = new Request("http://localhost/a",);
    const b = new Request("http://localhost/b",);
    const nonceA = generateNonce(a,);
    expect(getNonce(b,),).toBeNull();
    const nonceB = generateNonce(b,);
    expect(nonceB,).not.toBe(nonceA,);
    expect(getNonce(a,),).toBe(nonceA,);
  });
});
