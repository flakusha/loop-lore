// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the NSFW context prompt section (`nsfwContext`).
 *
 * Verifies the NSFW opt-in gate (dead-module wiring sweep):
 * - disabled unless the chat config allows NSFW, the runtime admin toggle is
 *   on, and the caller asked for story context
 * - NSFW-on: emits intimacy/arousal/desire context for seeded rows
 * - registered in PROMPT_SECTIONS right after nsfwPolicy
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { resetNsfwRuntimeConfig, updateRuntimeNsfwConfig, } from "../../../nsfw/runtime-config";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterArousal,
  insertCharacterDesireProfile,
  insertCharacterIntimacy,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { PROMPT_SECTIONS, } from "../registry";
import type { AssembleContext, } from "../types";
import { nsfwContextSection, } from "./nsfw-context";

/**
 * @param config
 * @param includeStoryContext
 * @param participantIds
 * @returns AssembleContext
 */
function makeCtx(
  config?: unknown,
  includeStoryContext?: boolean,
  participantIds: string[] = [],
): AssembleContext {
  return {
    db: {} as Kysely<DB>,
    actor: {
      id: "actor-1",
      display_name: "Test",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: { id: "chat-1", mode: "story", world_id: "world-1", current_location_id: null, },
    params: {
      actorId: "actor-1",
      chatId: "chat-1",
      modelId: "test-model",
      includeStoryContext,
      groupParticipantIds: participantIds,
    },
    isStory: true,
    tokenBudget: 32_000,
    config: config as AssembleContext["config"],
  };
}

describe("nsfwContextSection gate", () => {
  beforeEach(() => {
    resetNsfwRuntimeConfig();
  },);

  test("disabled when nsfw.allowNsfw is false", () => {
    const ctx = makeCtx({ nsfw: { allowNsfw: false, }, }, true,);
    expect(nsfwContextSection.enabled(ctx,),).toBe(false,);
  });

  test("disabled when the runtime admin toggle is off", () => {
    updateRuntimeNsfwConfig({ allowNsfw: false, },);
    const ctx = makeCtx({ nsfw: { allowNsfw: true, }, }, true,);
    expect(nsfwContextSection.enabled(ctx,),).toBe(false,);
  });

  test("disabled when story context is not requested", () => {
    const ctx = makeCtx({ nsfw: { allowNsfw: true, }, }, false,);
    expect(nsfwContextSection.enabled(ctx,),).toBe(false,);
  });

  test("enabled when NSFW is allowed and story context requested", () => {
    expect(nsfwContextSection.enabled(makeCtx(undefined, true,),),).toBe(true,);
    expect(
      nsfwContextSection.enabled(makeCtx({ nsfw: { allowNsfw: true, }, }, true,),),
    ).toBe(true,);
  });

  test("registered right after nsfwPolicy in PROMPT_SECTIONS", () => {
    const names = PROMPT_SECTIONS.map((s,) => s.name);
    expect(names,).toContain("nsfwContext",);
    expect(names.indexOf("nsfwContext",),).toBe(names.indexOf("nsfwPolicy",) + 1,);
  });
});

describe("nsfwContextSection build", () => {
  beforeEach(() => {
    resetNsfwRuntimeConfig();
  },);

  test("NSFW-on chat emits intimacy, arousal and desire context", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User 1", { id: "user-1", },);
    await insertWorlds(db, "user-1", "World", { id: "world-1", } as never,);
    await insertActors(db, "Lead", { id: "actor-1", user_id: "user-1", owner_id: "user-1", },);
    await insertActors(db, "Partner", { id: "actor-2", user_id: "user-1", owner_id: "user-1", },);
    await insertCharacterIntimacy(db, "actor-1", "actor-2", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", {
      world_id: "world-1",
      score: 70,
    },);

    await insertCharacterArousal(
      db,
      "actor-1",
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      {
        world_id: "world-1",
        level: 60,
      },
    );

    await insertCharacterDesireProfile(db, "actor-1", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", {
      turn_ons: '["candlelight"]',
      hard_limits: '["nothing explicit"]',
    },);

    const ctx = makeCtx({ nsfw: { allowNsfw: true, }, }, true, ["actor-2",],);
    ctx.db = db;
    const msgs = await nsfwContextSection.build(ctx,);

    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.role,).toBe("system",);
    expect(msgs[0]!.content,).toContain("[NSFW Context]",);
    expect(msgs[0]!.content,).toContain("Intimacy with Partner: 70/100 (Dating)",);
    expect(msgs[0]!.content,).toContain("Current arousal: 60/100 (Highly Aroused)",);
    expect(msgs[0]!.content,).toContain("Turn-ons: candlelight",);
    expect(msgs[0]!.content,).toContain("Hard limits: nothing explicit",);
  });

  test("NSFW-off chat: gate is off even with NSFW rows seeded", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "user-1", "User 1", { id: "user-1", },);
    await insertWorlds(db, "user-1", "World", { id: "world-1", } as never,);
    await insertActors(db, "Lead", { id: "actor-1", user_id: "user-1", owner_id: "user-1", },);
    await insertCharacterArousal(
      db,
      "actor-1",
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      {
        world_id: "world-1",
        level: 90,
      },
    );

    const ctx = makeCtx({ nsfw: { allowNsfw: false, }, }, true,);
    ctx.db = db;
    // The gate is what protects non-NSFW prompts: with allowNsfw false the
    // orchestrator skips the section entirely, so output stays empty
    // regardless of seeded rows.
    expect(nsfwContextSection.enabled(ctx,),).toBe(false,);
  });
});
