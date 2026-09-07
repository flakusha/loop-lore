// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { MemoryEntry, } from "../types";
import { selectMemoriesForInjection, } from "./select";
import {
  DEFAULT_COMFORT,
  type InjectionContext,
  type MemoryInjectionConfig,
} from "./types";

const config: MemoryInjectionConfig = {
  baseProbability: 0.6,
  randomness: 0.2,
  contextBoost: 1.5,
  maxPerMessage: 5,
  cooldownTurns: 3,
};

const ctx: InjectionContext = {
  chatId: "chat-1",
  worldId: null,
  locationId: null,
  isPrivateChat: true,
  participantCount: 2,
  turnNumber: 10,
  currentKeywords: [],
  averageIntimacy: 50,
  moodModifier: 0,
  randomFn: () => 0,
};

/**
 * @param overrides
 */
function makeMemory(overrides: Partial<MemoryEntry> & { id: string },): MemoryEntry {
  return {
    content: "a memory",
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

describe("select gaps — ordering and caps", () => {
  test("selects by importance descending", () => {
    const memories = [
      makeMemory({ id: "low", importance: 0.2, },),
      makeMemory({ id: "high", importance: 0.9, },),
    ];
    const { selected, rejected, } = selectMemoriesForInjection(memories, config, ctx,);
    expect(selected.map((m,) => m.id),).toEqual(["high", "low",],);
    expect(rejected,).toEqual([],);
  });

  test("extra memories past maxPerMessage are rejected with the cap reason", () => {
    const memories = [
      makeMemory({ id: "a", importance: 0.9, },),
      makeMemory({ id: "b", importance: 0.5, },),
    ];
    const { selected, rejected, } = selectMemoriesForInjection(
      memories,
      { ...config, maxPerMessage: 1, },
      ctx,
    );
    expect(selected.map((m,) => m.id),).toEqual(["a",],);
    expect(rejected,).toHaveLength(1,);
    expect(rejected[0]?.memory.id,).toBe("b",);
    expect(rejected[0]?.reason,).toBe("max_per_message:1",);
    expect(rejected[0]?.probability,).toBe(0,);
  });

  test("decision rejections carry the decision reason and probability", () => {
    const memories = [makeMemory({ id: "blocked", privacy: "absolute" as MemoryEntry["privacy"], },),];
    const { selected, rejected, } = selectMemoriesForInjection(memories, config, ctx,);
    expect(selected,).toEqual([],);
    expect(rejected,).toHaveLength(1,);
    expect(rejected[0]?.reason,).toBe("privacy:absolute_never_shared",);
    expect(rejected[0]?.probability,).toBe(0,);
  });

  test("injection history enforces the cooldown", () => {
    const memories = [makeMemory({ id: "cool", },),];
    const history = new Map([["cool", 9,],],);
    const { selected, rejected, } = selectMemoriesForInjection(
      memories,
      config,
      ctx,
      DEFAULT_COMFORT,
      history,
    );
    expect(selected,).toEqual([],);
    expect(rejected[0]?.reason,).toBe("cooldown: 2 turns remaining",);
  });

  test("empty input selects and rejects nothing", () => {
    expect(selectMemoriesForInjection([], config, ctx,),).toEqual({
      selected: [],
      rejected: [],
    },);
  });
});
