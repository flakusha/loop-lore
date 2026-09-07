// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { MemoryEntry, } from "../types";
import { shouldInjectMemory, } from "./decide";
import {
  DEFAULT_COMFORT,
  DEFAULT_INJECTION_CONFIG,
  type InjectionContext,
} from "./types";

/**
 * @param overrides
 */
function makeMemory(overrides: Partial<MemoryEntry> = {},): MemoryEntry {
  return {
    id: "mem-1",
    content: "the dragon sleeps under the castle",
    memoryType: "episodic",
    confidence: 1,
    importance: 0.5,
    keywords: [],
    pinned: false,
    scope: "character",
    privacy: "shared",
    shareability: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * @param overrides
 */
function makeCtx(overrides: Partial<InjectionContext>,): InjectionContext {
  return {
    chatId: "chat-1",
    worldId: null,
    locationId: null,
    isPrivateChat: true,
    participantCount: 2,
    turnNumber: 10,
    currentKeywords: [],
    averageIntimacy: 50,
    moodModifier: 0,
    ...overrides,
  };
}

describe("decide gaps — privacy gate", () => {
  test("absolute privacy blocks with zero probability", () => {
    const d = shouldInjectMemory(
      makeMemory({ privacy: "absolute" as MemoryEntry["privacy"], },),
      DEFAULT_INJECTION_CONFIG,
      makeCtx({ randomFn: () => 0, },),
    );
    expect(d.inject,).toBe(false,);
    expect(d.probability,).toBe(0,);
    expect(d.reason,).toBe("privacy:absolute_never_shared",);
  });

  test("privacy wins over pinned", () => {
    const d = shouldInjectMemory(
      makeMemory({ privacy: "absolute" as MemoryEntry["privacy"], pinned: true, },),
      DEFAULT_INJECTION_CONFIG,
      makeCtx({ randomFn: () => 0, },),
    );
    expect(d.inject,).toBe(false,);
    expect(d.reason,).toBe("privacy:absolute_never_shared",);
  });
});

describe("decide gaps — cooldown", () => {
  test("recent injection blocks with remaining-turns reason", () => {
    const d = shouldInjectMemory(
      makeMemory(),
      DEFAULT_INJECTION_CONFIG,
      makeCtx({ randomFn: () => 0, },),
      DEFAULT_COMFORT,
      9,
    );
    expect(d.inject,).toBe(false,);
    expect(d.probability,).toBe(0,);
    expect(d.reason,).toBe("cooldown: 2 turns remaining",);
  });

  test("expired cooldown proceeds to the roll", () => {
    const d = shouldInjectMemory(
      makeMemory(),
      DEFAULT_INJECTION_CONFIG,
      makeCtx({ randomFn: () => 0, },),
      DEFAULT_COMFORT,
      7,
    );
    expect(d.inject,).toBe(true,);
    expect(d.probability,).toBeCloseTo(0.35, 10,);
  });
});

describe("decide gaps — context boost", () => {
  test("relevant memory gets the boost and passes", () => {
    const memory = makeMemory({ keywords: ["dragon", "castle", "sword",], },);
    const ctx = makeCtx({ currentKeywords: ["dragon", "castle", "quest",], randomFn: () => 0.5, },);
    const d = shouldInjectMemory(memory, DEFAULT_INJECTION_CONFIG, ctx,);
    expect(d.probability,).toBeCloseTo(0.63, 10,);
    expect(d.inject,).toBe(true,);
    expect(d.reason,).toBe("passed: 0.500 <= 0.630",);
  });

  test("irrelevant memory misses the boost and fails the same roll", () => {
    const memory = makeMemory({ keywords: ["dragon", "castle", "sword",], },);
    const ctx = makeCtx({ currentKeywords: ["fishing", "boats",], randomFn: () => 0.5, },);
    const d = shouldInjectMemory(memory, DEFAULT_INJECTION_CONFIG, ctx,);
    expect(d.probability,).toBeCloseTo(0.42, 10,);
    expect(d.inject,).toBe(false,);
    expect(d.reason,).toBe("failed: 0.500 > 0.420",);
  });
});

describe("decide gaps — secret intimacy gate", () => {
  test("low intimacy blocks secret memories", () => {
    const d = shouldInjectMemory(
      makeMemory({ privacy: "secret", },),
      DEFAULT_INJECTION_CONFIG,
      makeCtx({ averageIntimacy: 10, randomFn: () => 0, },),
    );
    expect(d.inject,).toBe(false,);
    expect(d.probability,).toBe(0,);
    expect(d.reason,).toBe("intimacy:10 < threshold:50",);
  });

  test("high intimacy applies the secret sharing probability", () => {
    const d = shouldInjectMemory(
      makeMemory({ privacy: "secret", },),
      DEFAULT_INJECTION_CONFIG,
      makeCtx({ averageIntimacy: 80, randomFn: () => 0.5, },),
    );
    expect(d.probability,).toBeCloseTo(0.126, 10,);
    expect(d.inject,).toBe(false,);
  });

  test("high intimacy plus lucky roll injects the secret", () => {
    const d = shouldInjectMemory(
      makeMemory({ privacy: "secret", },),
      DEFAULT_INJECTION_CONFIG,
      makeCtx({ averageIntimacy: 80, randomFn: () => 0, },),
    );
    expect(d.probability,).toBeCloseTo(0.105, 10,);
    expect(d.inject,).toBe(true,);
  });
});

describe("decide gaps — trauma resistance", () => {
  test("high-importance memories are dampened", () => {
    const ctx = makeCtx({ randomFn: () => 0.5, },);
    const calm = shouldInjectMemory(makeMemory({ importance: 0.5, },), DEFAULT_INJECTION_CONFIG, ctx,);
    const heavy = shouldInjectMemory(
      makeMemory({ importance: 0.9, },),
      DEFAULT_INJECTION_CONFIG,
      ctx,
    );
    expect(calm.probability,).toBeCloseTo(0.42, 10,);
    expect(heavy.probability,).toBeCloseTo(0.315, 10,);
  });
});
