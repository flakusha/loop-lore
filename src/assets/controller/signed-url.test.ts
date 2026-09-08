// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for signed asset URLs.
 *
 * Covers signing + verification: round-trip, expiry, tamper detection,
 * action/asset binding, and secret resolution policy.
 */

import { describe, expect, test } from "bun:test";
import {
  isSignedUrlAction,
  resolveSignedUrlSecret,
  signAssetUrl,
  verifyAssetUrl,
} from "./signed-url";

const SECRET = "test-hmac-secret-0123456789";
const ASSET = "asset-123";
const NOW = 1_700_000_000_000; // fixed epoch ms for determinism

describe("signed asset URLs", () => {
  test("sign + verify round-trips for a valid unexpired token", async () => {
    const signed = await signAssetUrl({ secret: SECRET, assetId: ASSET, action: "raw", now: NOW });

    expect(signed.expiresAt).toBe(NOW + 900_000);
    expect(signed.token.length).toBeGreaterThan(20);

    const result = await verifyAssetUrl({
      secret: SECRET,
      token: signed.token,
      assetId: ASSET,
      action: "raw",
      expiresAt: signed.expiresAt,
      now: NOW + 1000,
    });
    expect(result).toEqual({ valid: true });
  });

  test("honors a custom expiry", async () => {
    const signed = await signAssetUrl({
      secret: SECRET,
      assetId: ASSET,
      action: "download",
      expiresInSeconds: 60,
      now: NOW,
    });
    expect(signed.expiresAt).toBe(NOW + 60_000);
  });

  test("rejects an expired token", async () => {
    const signed = await signAssetUrl({ secret: SECRET, assetId: ASSET, action: "raw", now: NOW });

    const result = await verifyAssetUrl({
      secret: SECRET,
      token: signed.token,
      assetId: ASSET,
      action: "raw",
      expiresAt: signed.expiresAt,
      now: signed.expiresAt + 1,
    });
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  test("rejects a token for the wrong asset id", async () => {
    const signed = await signAssetUrl({ secret: SECRET, assetId: ASSET, action: "raw", now: NOW });

    const result = await verifyAssetUrl({
      secret: SECRET,
      token: signed.token,
      assetId: "other-asset",
      action: "raw",
      expiresAt: signed.expiresAt,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  test("rejects a token used with a different action", async () => {
    const signed = await signAssetUrl({ secret: SECRET, assetId: ASSET, action: "raw", now: NOW });

    const result = await verifyAssetUrl({
      secret: SECRET,
      token: signed.token,
      assetId: ASSET,
      action: "download",
      expiresAt: signed.expiresAt,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  test("rejects a tampered token", async () => {
    const signed = await signAssetUrl({ secret: SECRET, assetId: ASSET, action: "raw", now: NOW });
    const tampered = `${signed.token.slice(0, -2)}aa`;

    const result = await verifyAssetUrl({
      secret: SECRET,
      token: tampered,
      assetId: ASSET,
      action: "raw",
      expiresAt: signed.expiresAt,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  test("rejects a token equal to the expected signature's first byte repeated (constant-time guard)", async () => {
    // Regression: a constant-time compare that XORs every byte against only
    // b[0] would accept a 32-byte token of all-equal bytes matching the first
    // byte of the real signature — enabling forgery. Lock it down.
    const signed = await signAssetUrl({ secret: SECRET, assetId: ASSET, action: "raw", now: NOW });
    const firstByte = signed.token.slice(0, 1);
    const forged = firstByte.repeat(signed.token.length);

    const result = await verifyAssetUrl({
      secret: SECRET,
      token: forged,
      assetId: ASSET,
      action: "raw",
      expiresAt: signed.expiresAt,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  test("rejects a token signed with a different secret", async () => {
    const signed = await signAssetUrl({ secret: SECRET, assetId: ASSET, action: "raw", now: NOW });

    const result = await verifyAssetUrl({
      secret: "a-different-secret",
      token: signed.token,
      assetId: ASSET,
      action: "raw",
      expiresAt: signed.expiresAt,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  test("rejects a non-finite expiry as malformed", async () => {
    const result = await verifyAssetUrl({
      secret: SECRET,
      token: "whatever",
      assetId: ASSET,
      action: "raw",
      expiresAt: NaN,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "malformed" });
  });

  test("rejects a token that is not valid base64url as malformed", async () => {
    const result = await verifyAssetUrl({
      secret: SECRET,
      token: "!!!not-base64url!!!",
      assetId: ASSET,
      action: "raw",
      expiresAt: NOW + 1000,
      now: NOW,
    });
    expect(result).toEqual({ valid: false, reason: "malformed" });
  });
});

describe("isSignedUrlAction", () => {
  test("accepts the four serve actions", () => {
    for (const a of ["raw", "download", "thumb", "compressed"]) {
      expect(isSignedUrlAction(a)).toBe(true);
    }
  });

  test("rejects unknown actions", () => {
    expect(isSignedUrlAction("admin")).toBe(false);
    expect(isSignedUrlAction("")).toBe(false);
  });
});

describe("resolveSignedUrlSecret", () => {
  test("prefers assets secret over jwt secret", () => {
    expect(resolveSignedUrlSecret("assets-secret", "jwt-secret")).toBe("assets-secret");
  });

  test("falls back to jwt secret when assets secret is empty", () => {
    expect(resolveSignedUrlSecret("", "jwt-secret")).toBe("jwt-secret");
    expect(resolveSignedUrlSecret(undefined, "jwt-secret")).toBe("jwt-secret");
  });

  test("returns null when both are unset (fail closed)", () => {
    expect(resolveSignedUrlSecret(undefined, undefined)).toBeNull();
    expect(resolveSignedUrlSecret("", "")).toBeNull();
  });

  test("does not throw on fallback (warn is best-effort, optional)", () => {
    // The one-shot warn uses `getLog()?.warn(...)` — if no logger is bound
    // (test harness without init), it silently no-ops. Verify the function
    // still returns the resolved secret in that case. The one-shot latch
    // suppresses only the warn, not the resolution.
    expect(resolveSignedUrlSecret("", "jwt-a")).toBe("jwt-a");
    expect(resolveSignedUrlSecret(undefined, "jwt-b")).toBe("jwt-b");
    expect(resolveSignedUrlSecret("", "jwt-c")).toBe("jwt-c");
  });
});
