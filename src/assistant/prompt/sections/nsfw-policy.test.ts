/**
 * Unit tests for the NSFW policy prompt section (`nsfwPolicy`).
 *
 * Verifies the SFW/NSFW level-taxonomy system message is injectable:
 * - gated off when nsfw.allowNsfw is false
 * - injected with the config-driven nsfwPolicy prompt when enabled
 * - falls back to the code default when no config override is present
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { NSFW_POLICY_LEVELS_PROMPT, } from "../../../prompts";
import type { AssembleContext, } from "../types";
import { nsfwPolicySection, } from "./nsfw-policy";

function makeCtx(config?: unknown,): AssembleContext {
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
    } as AssembleContext["actor"],
    chat: { id: "chat-1", mode: "story", world_id: "world-1", current_location_id: null, } as AssembleContext["chat"],
    params: { actorId: "actor-1", chatId: "chat-1", modelId: "test-model", },
    isStory: true,
    tokenBudget: 32_000,
    config: config as AssembleContext["config"],
  };
}

describe("nsfwPolicySection", () => {
  test("disabled when nsfw.allowNsfw is false", () => {
    const ctx = makeCtx({ nsfw: { allowNsfw: false, }, },);
    expect(nsfwPolicySection.enabled(ctx,),).toBe(false,);
  });

  test("enabled when nsfw.allowNsfw is true", () => {
    const ctx = makeCtx({ nsfw: { allowNsfw: true, }, },);
    expect(nsfwPolicySection.enabled(ctx,),).toBe(true,);
  });

  test("injects the code-default policy prompt when no config override", async () => {
    const ctx = makeCtx(undefined,);
    expect(nsfwPolicySection.enabled(ctx,),).toBe(true,);
    const msgs = await nsfwPolicySection.build(ctx,);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.role,).toBe("system",);
    expect(msgs[0]!.content,).toContain("Content rating policy",);
    expect(msgs[0]!.content,).toContain("nsfw_intense",);
    expect(msgs[0]!.content,).toContain(NSFW_POLICY_LEVELS_PROMPT,);
  });

  test("injects the config-overridden nsfwPolicy prompt", async () => {
    const custom = "Custom NSFW policy text.";
    const ctx = makeCtx({
      nsfw: { allowNsfw: true, },
      templates: { llm: { systemPrompts: { nsfwPolicy: custom, }, }, },
    },);
    const msgs = await nsfwPolicySection.build(ctx,);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.content,).toContain(custom,);
    expect(msgs[0]!.content,).not.toContain("Content rating policy",);
  });
});
