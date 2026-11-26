// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** P0 regressions: skip-only pruning and config-driven thresholds. */
import { describe, expect, test, } from "bun:test";
import {
  DEFAULT_PRUNING_CONFIG,
  pruneMessages,
  type ScorableMessage,
  scoreMessage,
} from "./index";

/**
 * @param id
 * @param content
 * @param index
 * @param total
 * @param role
 */
function msg(
  id: string,
  content: string,
  index: number,
  total: number,
  role: ScorableMessage["role"] = "user",
): ScorableMessage {
  return { id, content, role, index, total, };
}

describe("pruning — P0 regressions", () => {
  test("an oversized candidate is skipped, not fatal to pruning", () => {
    const messages = [
      msg("m0", `X-${"x".repeat(10_000,)}`, 0, 3, "system",),
      msg("m1", `Y-SKIP-${"y".repeat(100,)}`, 1, 3, "system",),
      msg("m2", `Z-${"z".repeat(100,)}`, 2, 3,),
    ];

    const result = pruneMessages(messages, {
      ...DEFAULT_PRUNING_CONFIG,
      targetTokens: 2400,
    },);

    expect(result.pruned.some((m,) => m.content.startsWith("Y-SKIP",)),).toBe(true,);
  });

  test("promoteThreshold, strategy and keepThreshold come from config", () => {
    const threeKeywords = msg("a", "lore decide fear", 5, 10,);
    expect(
      scoreMessage(threeKeywords, {
        ...DEFAULT_PRUNING_CONFIG,
        promoteThreshold: 0.3,
      },).shouldPromote,
    ).toBe(true,);

    const fourKeywords = msg("b", "lore decide fear castle", 5, 10,);
    expect(
      scoreMessage(fourKeywords, {
        ...DEFAULT_PRUNING_CONFIG,
        strategy: "aggressive",
      },).shouldPromote,
    ).toBe(false,);

    const plain = msg("c", "plain words", 5, 10,); // relevance 0.35
    expect(
      scoreMessage(plain, {
        ...DEFAULT_PRUNING_CONFIG,
        keepThreshold: 0.9,
      },).shouldKeep,
    ).toBe(false,);

    expect(
      scoreMessage(plain, {
        ...DEFAULT_PRUNING_CONFIG,
        keepThreshold: 0.1,
      },).shouldKeep,
    ).toBe(true,);

    expect(
      scoreMessage(plain, {
        ...DEFAULT_PRUNING_CONFIG,
        strategy: "aggressive",
      },).shouldKeep,
    ).toBe(false,);

    expect(
      scoreMessage(plain, {
        ...DEFAULT_PRUNING_CONFIG,
        strategy: "conservative",
      },).shouldKeep,
    ).toBe(true,);
  });
});
