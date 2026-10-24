// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the output-language prompt section (`outputLanguage`).
 *
 * The section reads the chat's content language from `gm_config.contentLanguage`
 * and falls back to the legacy `story_state.autoTranslateLang`; when neither
 * resolves it emits nothing (byte-identical baseline).
 *
 * Resource contract: a stub Kysely (no DB, no files, no ports).
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { AssembleContext, } from "../types";
import { outputLanguageSection, } from "./output-language";

/** Rows the stubbed `chats` select returns. */
interface ChatRows {
  gm_config?: string | null;
  story_state?: string | null;
}

/**
 * A Kysely stub that answers the two `chats` selects the section issues.
 * @param rows - the row the select resolves to
 */
function stubDb(rows: ChatRows,): Kysely<DB> {
  const db = {
    selectFrom: (_table: string,) => ({
      select: (_cols: string[],) => ({
        where: () => ({
          executeTakeFirst: async () => rows,
        }),
      }),
    }),
  };

  return db as unknown as Kysely<DB>;
}

/**
 * @param rows - the chat row the stub resolves to
 * @param gmConfig - the pre-projected `gm_config` on the chat projection
 */
function ctxWith(rows: ChatRows, gmConfig?: string | null,): AssembleContext {
  return {
    db: stubDb(rows,),
    actor: {
      id: "actor-1",
      display_name: "A",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: { id: "chat-1", mode: "story", world_id: null, current_location_id: null, gm_config: gmConfig ?? null, },
    params: { actorId: "actor-1", chatId: "chat-1", modelId: "test-model", },
    isStory: true,
    tokenBudget: 32_000,
  };
}

describe("outputLanguageSection", () => {
  test("always enabled — it is a generation directive, never a gate", () => {
    expect(outputLanguageSection.enabled(ctxWith({},),),).toBe(true,);
  });

  test("emits the directive from the chat's gm_config content language", async () => {
    const ctx = ctxWith({}, JSON.stringify({ contentLanguage: "de", },),);
    const msgs = await outputLanguageSection.build(ctx,);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.role,).toBe("system",);
    expect(msgs[0]!.content,).toContain("respond in German",);
    expect(msgs[0]!.content,).toContain("(de)",);
  });

  test("reads gm_config from the DB when the chat projection has none", async () => {
    const ctx = ctxWith({ gm_config: JSON.stringify({ contentLanguage: "fr", },), },);
    const msgs = await outputLanguageSection.build(ctx,);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.content,).toContain("respond in French",);
  });

  test("falls back to the legacy story_state autoTranslateLang", async () => {
    const ctx = ctxWith({ story_state: JSON.stringify({ autoTranslateLang: "ja", },), },);
    const msgs = await outputLanguageSection.build(ctx,);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]!.content,).toContain("respond in Japanese",);
  });

  test("emits nothing when neither rung resolves", async () => {
    const ctx = ctxWith({},);
    expect(await outputLanguageSection.build(ctx,),).toEqual([],);
  });

  test("emits nothing for a malformed gm_config and an absent story_state", async () => {
    const ctx = ctxWith({ gm_config: "not-json", story_state: null, },);
    expect(await outputLanguageSection.build(ctx,),).toEqual([],);
  });

  test("emits nothing for a content language outside the translate catalog", async () => {
    const ctx = ctxWith({}, JSON.stringify({ contentLanguage: "xx", },),);
    // "xx" is not in the translate catalog, so the language never resolves and
    // the section stays silent rather than naming a language it cannot speak.
    expect(await outputLanguageSection.build(ctx,),).toEqual([],);
  });
});
