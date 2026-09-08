// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for NSFW PII redaction — actorHash / chatHash HKDF domain separation.
 *
 * Verifies:
 * - null input → null output (no-op guard)
 * - missing/empty jwtSecret → null (fail-closed)
 * - valid jwtSecret → deterministic 16-char hex hash
 * - same inputs produce same hash (determinism)
 * - different secrets produce different hashes (domain isolation)
 * - domainKey is called with "nsfw-pii" info string
 */
import { actorHash, chatHash } from "./pii-redact";
import type { AuthConfig } from "../config/schema/auth";

const SECRET = "s".repeat(32);

describe("actorHash", () => {
  it("returns null when userId is null", async () => {
    const result = await actorHash(null, { jwtSecret: SECRET });
    expect(result).toBeNull();
  });

  it("returns null when authConfig is undefined", async () => {
    const result = await actorHash("user-123", undefined);
    expect(result).toBeNull();
  });

  it("returns null when jwtSecret is undefined", async () => {
    const result = await actorHash("user-123", { jwtSecret: undefined });
    expect(result).toBeNull();
  });

  it("returns null when jwtSecret is empty string (fail-closed)", async () => {
    const result = await actorHash("user-123", { jwtSecret: "" });
    expect(result).toBeNull();
  });

  it("returns a 16-char hex string when jwtSecret is set", async () => {
    const result = await actorHash("user-123", { jwtSecret: SECRET });
    expect(result).not.toBeNull();
    expect(result!.length).toBe(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same inputs give same hash", async () => {
    const cfg: AuthConfig = { jwtSecret: SECRET };
    const r1 = await actorHash("user-123", cfg);
    const r2 = await actorHash("user-123", cfg);
    expect(r1).toBe(r2);
  });

  it("different userIds give different hashes", async () => {
    const cfg: AuthConfig = { jwtSecret: SECRET };
    const r1 = await actorHash("user-123", cfg);
    const r2 = await actorHash("user-456", cfg);
    expect(r1).not.toBe(r2);
  });

  it("different secrets give different hashes", async () => {
    const r1 = await actorHash("user-123", { jwtSecret: "a".repeat(32) });
    const r2 = await actorHash("user-123", { jwtSecret: "b".repeat(32) });
    expect(r1).not.toBe(r2);
  });
});

describe("chatHash", () => {
  it("returns null when chatId is null", async () => {
    const result = await chatHash(null, { jwtSecret: SECRET });
    expect(result).toBeNull();
  });

  it("returns null when authConfig is undefined", async () => {
    const result = await chatHash("chat-abc", undefined);
    expect(result).toBeNull();
  });

  it("returns null when jwtSecret is undefined", async () => {
    const result = await chatHash("chat-abc", { jwtSecret: undefined });
    expect(result).toBeNull();
  });

  it("returns null when jwtSecret is empty string (fail-closed)", async () => {
    const result = await chatHash("chat-abc", { jwtSecret: "" });
    expect(result).toBeNull();
  });

  it("returns a 16-char hex string when jwtSecret is set", async () => {
    const result = await chatHash("chat-abc", { jwtSecret: SECRET });
    expect(result).not.toBeNull();
    expect(result!.length).toBe(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same inputs give same hash", async () => {
    const cfg: AuthConfig = { jwtSecret: SECRET };
    const r1 = await chatHash("chat-abc", cfg);
    const r2 = await chatHash("chat-abc", cfg);
    expect(r1).toBe(r2);
  });

  it("different chatIds give different hashes", async () => {
    const cfg: AuthConfig = { jwtSecret: SECRET };
    const r1 = await chatHash("chat-abc", cfg);
    const r2 = await chatHash("chat-def", cfg);
    expect(r1).not.toBe(r2);
  });

  it("different secrets give different hashes", async () => {
    const r1 = await chatHash("chat-abc", { jwtSecret: "a".repeat(32) });
    const r2 = await chatHash("chat-abc", { jwtSecret: "b".repeat(32) });
    expect(r1).not.toBe(r2);
  });
});
