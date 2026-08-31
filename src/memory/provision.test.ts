/**
 * Memory provision unit tests.
 *
 * Tests privacy-aware filtering, scope checks, and token budget enforcement.
 */
import { describe, expect, test, } from "bun:test";
import { provisionMemories, } from "./provision";
import type { ProvisionContext, } from "./provision";
import type { MemoryEntry, } from "./types";

// ─── Helpers ───────────────────────────────────────────────────

/**
 * @param overrides
 */
function makeMemory(overrides: Partial<MemoryEntry> & { id: string },): MemoryEntry {
  return {
    actorId: "char-1",
    content: "Test memory content",
    memoryType: "episodic",
    confidence: 0.8,
    importance: 0.7,
    keywords: ["test",],
    pinned: false,
    scope: "character",
    privacy: "shared",
    shareability: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * @param overrides
 */
function makeCtx(overrides: Partial<ProvisionContext> = {},): ProvisionContext {
  return {
    viewerId: "char-1",
    ownerId: "char-1",
    chatId: "chat-1",
    worldId: "world-1",
    participantIds: ["char-1", "user-1",],
    ...overrides,
  };
}

// ─── Scope Filtering ──────────────────────────────────────────

describe("provisionMemories — scope filtering", () => {
  test("character memory accepted for owner", () => {
    const mem = makeMemory({ id: "m1", scope: "character", actorId: "char-1", },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "char-1", },),);
    expect(result.accepted,).toHaveLength(1,);
    expect(result.rejected,).toHaveLength(0,);
  });

  test("character memory rejected for non-owner", () => {
    const mem = makeMemory({ id: "m1", scope: "character", actorId: "char-1", },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "char-2", },),);
    expect(result.accepted,).toHaveLength(0,);
    expect(result.rejected[0]!.reason,).toBe("scope:character_not_owner",);
  });

  test("world memory accepted when in same world", () => {
    const mem = makeMemory({ id: "m1", scope: "world", worldId: "world-1", },);
    const result = provisionMemories([mem,], makeCtx({ worldId: "world-1", },),);
    expect(result.accepted,).toHaveLength(1,);
  });

  test("world memory rejected when different world", () => {
    const mem = makeMemory({ id: "m1", scope: "world", worldId: "world-2", },);
    const result = provisionMemories([mem,], makeCtx({ worldId: "world-1", },),);
    expect(result.accepted,).toHaveLength(0,);
    expect(result.rejected[0]!.reason,).toBe("scope:world_mismatch",);
  });

  test("world memory rejected when no world context", () => {
    const mem = makeMemory({ id: "m1", scope: "world", worldId: "world-1", },);
    const result = provisionMemories([mem,], makeCtx({ worldId: null, },),);
    expect(result.accepted,).toHaveLength(0,);
  });

  test("assistant memory accepted for any viewer", () => {
    const mem = makeMemory({ id: "m1", scope: "assistant", userId: "user-1", },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "char-2", },),);
    expect(result.accepted,).toHaveLength(1,);
  });
});

// ─── Privacy Filtering ────────────────────────────────────────

describe("provisionMemories — privacy filtering", () => {
  test("public memory visible to everyone", () => {
    const mem = makeMemory({ id: "m1", privacy: "public", },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "stranger", },),);
    expect(result.accepted,).toHaveLength(1,);
  });

  test("shared memory visible to owner", () => {
    const mem = makeMemory({ id: "m1", privacy: "shared", },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "char-1", },),);
    expect(result.accepted,).toHaveLength(1,);
  });

  test("shared memory not auto-visible to non-owner", () => {
    const mem = makeMemory({ id: "m1", privacy: "shared", actorId: "char-1", },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "stranger", },),);
    expect(result.accepted,).toHaveLength(0,);
  });

  test("private memory visible only to owner", () => {
    const mem = makeMemory({ id: "m1", privacy: "private", actorId: "char-1", },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "char-1", },),);
    expect(result.accepted,).toHaveLength(1,);

    const result2 = provisionMemories([mem,], makeCtx({ viewerId: "char-2", },),);
    expect(result2.accepted,).toHaveLength(0,);
    expect(result2.rejected[0]!.reason,).toBe("scope:character_not_owner",);
  });

  test("secret memory withheld from non-trusted non-owner", () => {
    const mem = makeMemory({
      id: "m1",
      privacy: "secret",
      actorId: "char-1",
      shareability: JSON.stringify({ shareProbability: 0, trustedActorIds: [], blockedActorIds: [], },),
    },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "char-2", randomFn: () => 0.5, },),);
    expect(result.accepted,).toHaveLength(0,);
  });

  test("secret memory shared with trusted actor", () => {
    const mem = makeMemory({
      id: "m1",
      privacy: "secret",
      actorId: "char-1",
      shareability: JSON.stringify({ shareProbability: 0, trustedActorIds: ["char-2",], blockedActorIds: [], },),
    },);
    const result = provisionMemories([mem,], makeCtx({ viewerId: "char-2", },),);
    expect(result.accepted,).toHaveLength(1,);
  });
});

// ─── Token Budget ─────────────────────────────────────────────

describe("provisionMemories — token budget", () => {
  test("fits memories within budget", () => {
    const mem1 = makeMemory({ id: "m1", content: "Short", importance: 0.9, confidence: 0.9, },);
    const mem2 = makeMemory({ id: "m2", content: "A".repeat(4000,), importance: 0.5, confidence: 0.5, },); // ~1000 tokens
    const result = provisionMemories([mem1, mem2,], makeCtx(), 500,);
    // mem1 (pinned=false, ~2 tokens) fits; mem2 (~1000 tokens) exceeds remaining budget
    expect(result.accepted.length,).toBeLessThanOrEqual(2,);
    expect(result.tokensUsed,).toBeLessThanOrEqual(500,);
  });

  test("pinned memories always included", () => {
    const mem1 = makeMemory({ id: "m1", content: "Pinned".repeat(100,), pinned: true, importance: 0.1, },);
    const mem2 = makeMemory({ id: "m2", content: "Important", importance: 0.9, confidence: 0.9, },);
    const result = provisionMemories([mem1, mem2,], makeCtx(), 200,);
    expect(result.accepted.some((m,) => m.id === "m1"),).toBe(true,);
  });
});

// ─── Mixed Scenarios ──────────────────────────────────────────

describe("provisionMemories — mixed scenarios", () => {
  test("filters multiple memories with different privacy levels", () => {
    const memories = [
      makeMemory({ id: "m1", privacy: "public", scope: "character", actorId: "char-1", },),
      makeMemory({ id: "m2", privacy: "private", scope: "character", actorId: "char-1", },),
      makeMemory({
        id: "m3",
        privacy: "secret",
        scope: "character",
        actorId: "char-1",
        shareability: JSON.stringify({ shareProbability: 0, trustedActorIds: [], blockedActorIds: [], },),
      },),
      makeMemory({ id: "m4", scope: "character", actorId: "char-2", },), // wrong owner
    ];
    const result = provisionMemories(memories, makeCtx({ viewerId: "char-1", randomFn: () => 0.5, },),);
    // m1: public ✓, m2: private+owner ✓, m3: secret+owner ✓, m4: wrong owner ✗
    expect(result.accepted,).toHaveLength(3,);
    expect(result.rejected,).toHaveLength(1,);
  });

  test("world memories included alongside character memories", () => {
    const memories = [
      makeMemory({ id: "m1", scope: "character", actorId: "char-1", },),
      makeMemory({ id: "m2", scope: "world", worldId: "world-1", },),
    ];
    const result = provisionMemories(memories, makeCtx({ viewerId: "char-1", worldId: "world-1", },),);
    expect(result.accepted,).toHaveLength(2,);
  });
});
