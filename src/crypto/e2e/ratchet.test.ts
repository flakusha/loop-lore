/**
 * Unit tests for crypto/e2e/ratchet.ts — symmetric-key ratchet.
 *
 * No DB required — pure WebCrypto operations.
 */

import { describe, expect, test, } from "bun:test";
import { nextRatchetStep, } from "./ratchet";

// ── Helpers ──────────────────────────────────────────────

/**
 * Generate a deterministic-looking but random 32-byte key for testing.
 * @param seed
 */
function seedKey(seed: number,): Uint8Array {
  const out = new Uint8Array(32,);
  for (let i = 0; i < out.byteLength; i++) {
    out[i] = (seed * 31 + i * 7 + 13) & 0xff;
  }
  return out;
}

// ── Shape ────────────────────────────────────────────────

describe("nextRatchetStep — shape", () => {
  test("returns both chainKey and messageKey of 32 bytes", async () => {
    const ck = seedKey(1,);
    const step = await nextRatchetStep(ck,);
    expect(step.chainKey,).toBeInstanceOf(Uint8Array,);
    expect(step.messageKey,).toBeInstanceOf(Uint8Array,);
    expect(step.chainKey.byteLength,).toBe(32,);
    expect(step.messageKey.byteLength,).toBe(32,);
  });

  test("rejects chain keys that aren't 32 bytes", async () => {
    await expect(nextRatchetStep(new Uint8Array(31,),).then(() => undefined),).rejects.toThrow(
      /32 bytes/,
    );
    await expect(nextRatchetStep(new Uint8Array(33,),).then(() => undefined),).rejects.toThrow(
      /32 bytes/,
    );
  });

  test("chainKey and messageKey are distinct (no aliasing)", async () => {
    const step = await nextRatchetStep(seedKey(2,),);
    expect(step.chainKey,).not.toEqual(step.messageKey,);
  });
});

// ── Determinism + uniqueness ─────────────────────────────

describe("nextRatchetStep — determinism", () => {
  test("same input → same chain key and message key", async () => {
    // Note: input is zeroized by the first call, so we test determinism by
    // using two independent seed keys with identical bytes.
    const ckA = seedKey(3,);
    const ckB = seedKey(3,);
    const a = await nextRatchetStep(ckA,);
    const b = await nextRatchetStep(ckB,);
    expect(a.chainKey,).toEqual(b.chainKey,);
    expect(a.messageKey,).toEqual(b.messageKey,);
  });

  test("different inputs → different outputs", async () => {
    const a = await nextRatchetStep(seedKey(10,),);
    const b = await nextRatchetStep(seedKey(11,),);
    expect(a.chainKey,).not.toEqual(b.chainKey,);
    expect(a.messageKey,).not.toEqual(b.messageKey,);
  });

  test("consecutive steps from one chain produce 2 distinct chains + 2 distinct msgs", async () => {
    const ck0 = seedKey(20,);
    const step1 = await nextRatchetStep(ck0,);
    const step2 = await nextRatchetStep(step1.chainKey,);

    expect(step1.chainKey,).not.toEqual(step2.chainKey,);
    expect(step1.messageKey,).not.toEqual(step2.messageKey,);
    expect(step2.messageKey,).not.toEqual(step1.chainKey,);
  });

  test("100 steps all produce distinct message keys (no collision)", async () => {
    let ck = seedKey(30,);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const step = await nextRatchetStep(ck,);
      const tag = Buffer.from(step.messageKey,).toString("hex",);
      expect(seen.has(tag,),).toBe(false,);
      seen.add(tag,);
      ck = step.chainKey;
    }
    expect(seen.size,).toBe(100,);
  });
});

// ── Practical: encryption works with the message key ────

describe("nextRatchetStep — practical", () => {
  test("message key can encrypt + decrypt via AES-GCM", async () => {
    const step = await nextRatchetStep(seedKey(40,),);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      step.messageKey as Uint8Array<ArrayBuffer>,
      { name: "AES-GCM", length: 256, },
      false,
      ["encrypt", "decrypt",],
    );

    const iv = crypto.getRandomValues(new Uint8Array(12,),);
    const plaintext = new TextEncoder().encode("hello e2e",);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, }, cryptoKey, plaintext,);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, }, cryptoKey, ct,);
    expect(new TextDecoder().decode(pt,),).toBe("hello e2e",);
  });
});
