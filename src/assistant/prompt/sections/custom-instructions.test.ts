// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * customInstructionsSection tests — two-tier user steering
 * (TASK-two-tier-custom-instructions).
 *
 * The section is pure over the assembled context (the assembler threads the
 * account tier from `users.settings.customInstructions` and the story tier
 * from `chats.custom_instructions`), so no DB is needed.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { dropOverBudgetSections, } from "../../prompt-budget";
import { PROMPT_SECTIONS, } from "../registry";
import type { AssembleContext, PromptSectionReport, } from "../types";
import { customInstructionsSection, } from "./custom-instructions";

const DUMMY_DB = {} as unknown as Kysely<DB>;

/**
 * Minimal context with the two steering tiers.
 * @param userCustomInstructions
 * @param customInstructions
 */
function ctxFor(
  userCustomInstructions?: string | null,
  customInstructions?: string | null,
): AssembleContext {
  return {
    db: DUMMY_DB,
    actor: {
      id: "actor-1",
      display_name: "Alice",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: {
      id: "chat-1",
      mode: "story",
      world_id: null,
      current_location_id: null,
      custom_instructions: customInstructions ?? null,
    },
    params: { actorId: "actor-1", chatId: "chat-1", modelId: "m", },
    isStory: true,
    tokenBudget: 4000,
    userCustomInstructions: userCustomInstructions ?? null,
  };
}

/**
 * @param ctx
 */
async function buildContent(ctx: AssembleContext,): Promise<string> {
  const built = await customInstructionsSection.build(ctx,);
  expect(built.length,).toBe(1,);
  const [msg,] = built as [{ content: string; role: string },];
  expect(msg.role,).toBe("system",);
  return msg.content;
}

describe("customInstructionsSection", () => {
  test("disabled when both tiers are absent or blank", () => {
    expect(customInstructionsSection.enabled(ctxFor(),),).toBe(false,);
    expect(customInstructionsSection.enabled(ctxFor(null, null,),),).toBe(false,);
    expect(customInstructionsSection.enabled(ctxFor("   ", "\n",),),).toBe(false,);
  });

  test("enabled when either tier carries text", () => {
    expect(customInstructionsSection.enabled(ctxFor("be concise",),),).toBe(true,);
    expect(customInstructionsSection.enabled(ctxFor(undefined, "second person only",),),).toBe(true,);
  });

  test("account tier renders alone with its header", async () => {
    const out = await buildContent(ctxFor("be concise",),);
    expect(out,).toContain("[Account-wide rules — always apply]",);
    expect(out,).toContain("be concise",);
    expect(out,).not.toContain("[Story-specific rules",);
  });

  test("story tier renders alone with its header", async () => {
    const out = await buildContent(ctxFor(undefined, "second person only",),);
    expect(out,).toContain("[Story-specific rules",);
    expect(out,).toContain("second person only",);
    expect(out,).not.toContain("[Account-wide rules",);
  });

  test("stacking order: account tier first, story tier on top", async () => {
    const out = await buildContent(ctxFor("GLOBAL-TEXT", "STORY-TEXT",),);
    expect(out.indexOf("GLOBAL-TEXT",),).toBeLessThan(out.indexOf("STORY-TEXT",),);
    expect(out,).toContain("on conflict these win",);
  });

  test("wrapped in the untrusted-user-content marker", async () => {
    const out = await buildContent(ctxFor("x",),);
    expect(out,).toContain('<untrusted_user_content source="user.custom_instructions">',);
    expect(out,).toContain("</untrusted_user_content>",);
  });

  test("tiers are clamped to the 5000-char validation cap", async () => {
    const long = `${"a".repeat(4999,)}B${"c".repeat(1000,)}`; // 6000 chars, 'B' at 5000
    const out = await buildContent(ctxFor(long,),);
    expect(out,).toContain("B",); // within cap prefix kept
    expect(out,).not.toContain("cccc",); // tail beyond 5000 dropped
  });

  test("trimming precedence: never dropped by the token-budget trim", () => {
    const sections: PromptSectionReport[] = [
      { name: "customInstructions", chars: 8000, tokens: 2000, dropped: false, },
      { name: "lore", chars: 8000, tokens: 2000, dropped: false, },
      { name: "examples", chars: 8000, tokens: 2000, dropped: false, },
    ];
    dropOverBudgetSections(sections, 2500, 6000,);
    expect(sections[0]!.dropped,).toBe(false,); // PRIORITY 0 → kept
    expect(sections[1]!.dropped,).toBe(true,);
  });

  test("registered in the prompt section pipeline", () => {
    const names = PROMPT_SECTIONS.map((s,) => s.name);
    expect(names,).toContain("customInstructions",);
    expect(names.indexOf("customInstructions",),).toBeLessThan(names.indexOf("chatHistory",),);
  });
});
