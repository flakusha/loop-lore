// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `assistantPersonalitySection` and the composer constants it
 * depends on.
 *
 * The section is a pure pass-through: it fires only when the assembler already
 * resolved a voice block, which is what keeps `server-default` chats
 * byte-identical to pre-personality output. Both the on and off branches are
 * pinned, because a section that fires without a block would inject an empty
 * system message into every prompt.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { DRIFT_ADVISORY_THRESHOLD, PERSONALITY_CONFIG_KEY, } from "../../personality/composer";
import type { AssembleActor, AssembleChat, AssembleContext, } from "../types";
import { assistantPersonalitySection, } from "./assistant-personality";

const DUMMY_DB = {} as unknown as Kysely<DB>;

function ctxWith(block: string | undefined,): AssembleContext {
  const actor: AssembleActor = {
    id: "actor-1",
    display_name: "Alice",
    system_prompt: null,
    description: null,
    personality: null,
    scenario: null,
    post_history_instructions: null,
    mes_example: null,
    agent_role: null,
  };

  const chat: AssembleChat = {
    id: "chat-1",
    mode: "story",
    world_id: null,
    current_location_id: null,
  };

  return {
    db: DUMMY_DB,
    actor,
    chat,
    params: { actorId: "actor-1", chatId: "chat-1", modelId: "m", assistantPersonality: block, },
    isStory: true,
    tokenBudget: 4000,
  };
}

const BLOCK = "<assistant_personality>\nSpeak as a terse archivist.\n</assistant_personality>";

describe("assistantPersonalitySection", () => {
  test("registers under the name the assembler looks up", () => {
    expect(assistantPersonalitySection.name,).toBe("assistantPersonality",);
  });

  test("is disabled when no personality block was resolved", () => {
    expect(assistantPersonalitySection.enabled(ctxWith(undefined,),),).toBe(false,);
  });

  test("is enabled when a block was resolved", () => {
    expect(assistantPersonalitySection.enabled(ctxWith(BLOCK,),),).toBe(true,);
  });

  test("emits exactly one system message carrying the block verbatim", async () => {
    // build() is typed sync-or-async; await so the assertion sees the array.
    const msgs = await assistantPersonalitySection.build(ctxWith(BLOCK,),);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.role,).toBe("system",);
    // pass-through: no re-wrapping, no truncation, no mutation
    expect(msgs[0]!.content,).toBe(BLOCK,);
  });

  test("an empty-string block is still off (falsy), keeping prompts unchanged", () => {
    const ctx = ctxWith("",);
    expect(assistantPersonalitySection.enabled(ctx,),).toBe(false,);
    // build() is defensive even when called directly against a falsy block
    expect(assistantPersonalitySection.build(ctx,),).toEqual([],);
  });

  test("build() returns [] when invoked with no block, rather than an empty message", () => {
    expect(assistantPersonalitySection.build(ctxWith(undefined,),),).toEqual([],);
  });
});

describe("composer constants the section depends on", () => {
  test("PERSONALITY_CONFIG_KEY names the gm_config slot the binding lives in", () => {
    expect(PERSONALITY_CONFIG_KEY,).toBe("assistantPersonality",);
  });

  test("DRIFT_ADVISORY_THRESHOLD is the documented 0.5 cut-off", () => {
    expect(DRIFT_ADVISORY_THRESHOLD,).toBe(0.5,);
  });
});
