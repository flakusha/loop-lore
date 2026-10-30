/**
 * Tests for reaction scoring (Beta-Binomial) and grading aggregation.
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessageReactions,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { gradeModelsFromReactions, } from "./reaction-grade";
import {
  DEFAULT_POSITIVE_EMOJI,
  isPositiveReaction,
  MIN_SAMPLE_FLOOR,
  reactionScore,
  separable,
} from "./reaction-score";

describe("reaction scorer", () => {
  it("pulls small samples toward the prior", () => {
    const tiny = reactionScore({ messages: 1, reactedMessages: 1, },);
    expect(tiny.score,).toBeLessThan(0.5,);
    expect(tiny.published,).toBe(false,);
    // Large sample converges to the naive rate.
    const big = reactionScore({ messages: 1000, reactedMessages: 400, },);
    expect(Math.abs(big.score - 0.4,),).toBeLessThan(0.01,);
    expect(big.published,).toBe(true,);
    expect(MIN_SAMPLE_FLOOR,).toBe(30,);
  });

  it("treats only the explicit positive set as positive", () => {
    for (const emoji of DEFAULT_POSITIVE_EMOJI) {
      expect(isPositiveReaction(emoji,),).toBe(true,);
    }

    expect(isPositiveReaction("🐉",),).toBe(false,);
    expect(isPositiveReaction("💀",),).toBe(false,);
  });

  it("separates only non-overlapping scores", () => {
    const a = reactionScore({ messages: 500, reactedMessages: 250, },);
    const b = reactionScore({ messages: 500, reactedMessages: 100, },);
    expect(separable(a, b,),).toBe(true,);
    expect(separable(a, reactionScore({ messages: 500, reactedMessages: 245, },),),).toBe(false,);
  });
});

describe("reaction grading", () => {
  it("grades per-model rates and ignores unattributed rows", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, "grader", "Grader",);
      const actorId = await insertActors(db, "npc",);
      const chatId = await insertChats(db, "grade-chat", userId,);
      // 31 attributed messages (above the G>=30 floor), 10 with 👍.
      for (let i = 0; i < 31; i++) {
        const id = await insertMessages(db, chatId, actorId, "assistant", `reply ${i}`, {
          model_id: "qwen3-8b",
          provider: "local-a",
          status: "confirmed",
          visibility: "visible",
        },);

        if (i < 10) {
          await insertMessageReactions(db, id, userId, "👍",);
        }
      }

      // Decorative emoji never counts; unattributed copies never inflate G.
      const decoy = await insertMessages(db, chatId, actorId, "assistant", "dragon", {
        model_id: "qwen3-8b",
        provider: "local-a",
        status: "confirmed",
        visibility: "visible",
      },);

      await insertMessageReactions(db, decoy, userId, "🐉",);
      await insertMessages(db, chatId, actorId, "assistant", "carried copy", {
        status: "confirmed",
        visibility: "visible",
      },);

      expect(await gradeModelsFromReactions(db,),).toBe(1,);
      const rows = await db.selectFrom("model_rankings",).selectAll().execute();
      expect(rows.length,).toBe(1,);
      const row = rows[0]!;
      expect(row.metric,).toBe("reaction_rate",);
      expect(row.basis,).toBe("measured",);
      expect(row.value,).toBeCloseTo(11 / 42, 5,);
      const meta = JSON.parse(row.meta ?? "{}",) as { messages: number; reacted_messages: number; published: boolean };
      expect(meta.messages,).toBe(32,);
      expect(meta.reacted_messages,).toBe(10,);
      expect(meta.published,).toBe(true,);
    } finally {
      sqlite.close();
    }
  });
});
