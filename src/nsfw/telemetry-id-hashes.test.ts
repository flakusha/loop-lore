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
 * - different secrets produce different hashes (secret isolation)
 * - actor and chat IDs hash under separate domains (cross-type isolation)
 */
import { describe, expect, it, } from "bun:test";
import type { AuthConfig, } from "../config/schema/auth";
import { actorHash, categoriseError, chatHash, hmacHex, redactError, } from "./telemetry-id-hashes";

const SECRET = "s".repeat(32,);
describe("actorHash", () => {
  it("returns null when userId is null", async () => {
    const result = await actorHash(null, { jwtSecret: SECRET, },);
    expect(result,).toBeNull();
  });

  it("returns null when authConfig is undefined", async () => {
    const result = await actorHash("user-123", undefined,);
    expect(result,).toBeNull();
  });

  it("returns null when jwtSecret is undefined", async () => {
    const result = await actorHash("user-123", { jwtSecret: undefined, },);
    expect(result,).toBeNull();
  });

  it("returns null when jwtSecret is empty string (fail-closed)", async () => {
    const result = await actorHash("user-123", { jwtSecret: "", },);
    expect(result,).toBeNull();
  });

  it("returns a 16-char hex string when jwtSecret is set", async () => {
    const result = await actorHash("user-123", { jwtSecret: SECRET, },);
    expect(result,).not.toBeNull();
    expect(result!.length,).toBe(16,);
    expect(result,).toMatch(/^[0-9a-f]{16}$/,);
  });

  it("is deterministic — same inputs give same hash", async () => {
    const cfg: Pick<AuthConfig, "jwtSecret"> = { jwtSecret: SECRET, };
    const r1 = await actorHash("user-123", cfg,);
    const r2 = await actorHash("user-123", cfg,);
    expect(r1,).toBe(r2,);
  });

  it("different userIds give different hashes", async () => {
    const cfg: Pick<AuthConfig, "jwtSecret"> = { jwtSecret: SECRET, };
    const r1 = await actorHash("user-123", cfg,);
    const r2 = await actorHash("user-456", cfg,);
    expect(r1,).not.toBe(r2,);
  });

  it("different secrets give different hashes", async () => {
    const r1 = await actorHash("user-123", { jwtSecret: "a".repeat(32,), },);
    const r2 = await actorHash("user-123", { jwtSecret: "b".repeat(32,), },);
    expect(r1,).not.toBe(r2,);
  });
});

describe("chatHash", () => {
  it("returns null when chatId is null", async () => {
    const result = await chatHash(null, { jwtSecret: SECRET, },);
    expect(result,).toBeNull();
  });

  it("returns null when authConfig is undefined", async () => {
    const result = await chatHash("chat-abc", undefined,);
    expect(result,).toBeNull();
  });

  it("returns null when jwtSecret is undefined", async () => {
    const result = await chatHash("chat-abc", { jwtSecret: undefined, },);
    expect(result,).toBeNull();
  });

  it("returns null when jwtSecret is empty string (fail-closed)", async () => {
    const result = await chatHash("chat-abc", { jwtSecret: "", },);
    expect(result,).toBeNull();
  });

  it("returns a 16-char hex string when jwtSecret is set", async () => {
    const result = await chatHash("chat-abc", { jwtSecret: SECRET, },);
    expect(result,).not.toBeNull();
    expect(result!.length,).toBe(16,);
    expect(result,).toMatch(/^[0-9a-f]{16}$/,);
  });

  it("is deterministic — same inputs give same hash", async () => {
    const cfg: Pick<AuthConfig, "jwtSecret"> = { jwtSecret: SECRET, };
    const r1 = await chatHash("chat-abc", cfg,);
    const r2 = await chatHash("chat-abc", cfg,);
    expect(r1,).toBe(r2,);
  });

  it("different chatIds give different hashes", async () => {
    const cfg: Pick<AuthConfig, "jwtSecret"> = { jwtSecret: SECRET, };
    const r1 = await chatHash("chat-abc", cfg,);
    const r2 = await chatHash("chat-def", cfg,);
    expect(r1,).not.toBe(r2,);
  });

  it("different secrets give different hashes", async () => {
    const r1 = await chatHash("chat-abc", { jwtSecret: "a".repeat(32,), },);
    const r2 = await chatHash("chat-abc", { jwtSecret: "b".repeat(32,), },);
    expect(r1,).not.toBe(r2,);
  });
});

describe("cross-type isolation", () => {
  it("same raw id hashes differently as actor vs chat", async () => {
    const cfg: Pick<AuthConfig, "jwtSecret"> = { jwtSecret: SECRET, };
    const actor = await actorHash("shared-id", cfg,);
    const chat = await chatHash("shared-id", cfg,);
    expect(actor,).not.toBeNull();
    expect(chat,).not.toBeNull();
    expect(actor,).not.toBe(chat,);
  });
});

describe("hmacHex", () => {
  it("returns null when secret is empty (fail-closed)", async () => {
    expect(await hmacHex("value", "",),).toBeNull();
  });

  it("returns deterministic hex scaled by byteCount", async () => {
    const full = await hmacHex("value", SECRET,);
    expect(full,).toMatch(/^[0-9a-f]{16}$/,);
    expect(await hmacHex("value", SECRET,),).toBe(full,);
    expect(await hmacHex("value", SECRET, 4,),).toMatch(/^[0-9a-f]{8}$/,);
  });
});

describe("categoriseError", () => {
  it("buckets known patterns and falls back to other", () => {
    expect(categoriseError("connection timeout after 30s",),).toBe("timeout",);
    expect(categoriseError("429 too many requests",),).toBe("rate_limit",);
    expect(categoriseError("invalid json body",),).toBe("schema_validation",);
    expect(categoriseError("unauthorized 401",),).toBe("auth_failure",);
    expect(categoriseError("something completely odd",),).toBe("other",);
  });
});

describe("redactError", () => {
  it("passes null through with other category", () => {
    expect(redactError(null,),).toEqual({ category: "other", text: null, },);
  });

  it("strips credential values and keeps the category", () => {
    const result = redactError("auth_failure password=hunter2",);
    expect(result.category,).toBe("auth_failure",);
    expect(result.text,).not.toContain("hunter2",);
    expect(result.text,).toContain("[key_redacted]",);
  });

  it("truncates long text to the max length", () => {
    const result = redactError(`timeout ${"x".repeat(300,)}`,);
    expect(result.category,).toBe("timeout",);
    expect(result.text!.length,).toBe(200,);
  });
});
