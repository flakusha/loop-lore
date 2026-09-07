// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for authorNoteSection vs postHistorySection dual-injection
 * (BUG-author-note-section-duplicates-post-history-instructions-sam).
 *
 * The two sections read the same `actor.post_history_instructions` field
 * intentionally — they mirror SillyTavern's behavior:
 *
 *   - `authorNoteSection` injects as `role: "system"` near the top of the
 *     prompt so the LLM sees the instruction up-front (after character
 *     header, before messages).
 *   - `postHistorySection` injects as `role: "user"` AFTER the chat
 *     history so the instruction is the LAST message in the prompt
 *     (post-history means "append after history").
 *
 * The wrapping XML tag differs (`<author_note>` vs `<post_history>`)
 * so downstream consumers can distinguish them by role + tag without
 * reading the content. Removing either section silently strips the
 * pre-or-post placement that the LLM was relying on for emphasis.
 *
 * These tests pin the contract so the two sections can't silently
 * diverge (or get coalesced by a future refactor).
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { GenerationMessage, } from "../../../generation/gen-types-options";
import type { AssembleActor, AssembleChat, AssembleContext, } from "../types";
import { authorNoteSection, } from "./author-note";
import { postHistorySection, } from "./post-history";

const DUMMY_DB = {} as unknown as Kysely<DB>;

const NOTE = "Speak like a Victorian detective; never break the fourth wall.";

function ctxWith(note: string | null,): AssembleContext {
  const actor: AssembleActor = {
    id: "actor-1",
    display_name: "Alice",
    system_prompt: null,
    description: null,
    personality: null,
    scenario: null,
    post_history_instructions: note,
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
    params: { actorId: "actor-1", chatId: "chat-1", modelId: "m", },
    isStory: true,
    tokenBudget: 4000,
  };
}

/** Awaitable to handle both sync and async build signatures. */
async function messages(
  builder: typeof authorNoteSection,
  ctx: AssembleContext,
): Promise<GenerationMessage[]> {
  const out = await builder.build(ctx,);
  return Array.isArray(out,) ? out : [];
}

describe("authorNoteSection (author-note placement, top of prompt)", () => {
  test("renders <author_note> wrapped note with role=system", async () => {
    const ctx = ctxWith(NOTE,);
    expect(authorNoteSection.enabled(ctx,),).toBe(true,);
    const msgs = await messages(authorNoteSection, ctx,);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.role,).toBe("system",);
    expect(msgs[0]!.content,).toContain("<author_note>",);
    expect(msgs[0]!.content,).toContain(NOTE,);
  });

  test("disabled when post_history_instructions is null/blank", () => {
    expect(authorNoteSection.enabled(ctxWith(null,),),).toBe(false,);
    expect(authorNoteSection.enabled(ctxWith("   ",),),).toBe(false,);
    expect(authorNoteSection.enabled(ctxWith("",),),).toBe(false,);
  });

  test("name matches the registry identifier", () => {
    expect(authorNoteSection.name,).toBe("author-note",);
  });
});

describe("postHistorySection (post-history placement, end of prompt)", () => {
  test("renders <post_history> wrapped note with role=user (not system)", async () => {
    const ctx = ctxWith(NOTE,);
    expect(postHistorySection.enabled(ctx,),).toBe(true,);
    const msgs = await messages(postHistorySection, ctx,);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.role,).toBe("user",);
    expect(msgs[0]!.content,).toContain("<post_history>",);
    expect(msgs[0]!.content,).toContain(NOTE,);
  });

  test("disabled when post_history_instructions is null/blank", () => {
    expect(postHistorySection.enabled(ctxWith(null,),),).toBe(false,);
    expect(postHistorySection.enabled(ctxWith("",),),).toBe(false,);
  });

  test("name matches the registry identifier", () => {
    expect(postHistorySection.name,).toBe("postHistory",);
  });
});

describe("dual-injection contract (the two sections are intentionally redundant)", () => {
  test("same source field, different roles + different XML tags", async () => {
    const ctx = ctxWith(NOTE,);
    const a = await messages(authorNoteSection, ctx,);
    const p = await messages(postHistorySection, ctx,);
    // Same underlying source text:
    expect(a[0]!.content,).toContain(NOTE,);
    expect(p[0]!.content,).toContain(NOTE,);
    // Different roles:
    expect(a[0]!.role,).toBe("system",);
    expect(p[0]!.role,).toBe("user",);
    // Different wrapping tags — the LLM (and downstream consumers) can
    // distinguish the two placements by tag without re-reading content.
    expect(a[0]!.content,).toContain("<author_note>",);
    expect(p[0]!.content,).toContain("<post_history>",);
    expect(a[0]!.content,).not.toContain("<post_history>",);
    expect(p[0]!.content,).not.toContain("<author_note>",);
  });
});
