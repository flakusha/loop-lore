// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the validation-harness section and its wiring into the real
 * prompt assembly path: a configured harness reaches the LLM, while the
 * empty/absent defaults of the llm_only variants emit nothing.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import { PromptAssembler, } from "../../prompt-assembler";
import { PROMPT_SECTIONS, } from "../registry";
import type { AssembleContext, } from "../types";
import { readValidationHarness, validationHarnessSection, } from "./validation-harness";

/**
 * Minimal assembly context for a direct section build.
 * @param gmConfig - raw chats.gm_config JSON
 * @returns assembly context
 */
function ctxWith(gmConfig: string | null | undefined,): AssembleContext {
  return {
    db: {} as Kysely<DB>,
    actor: {
      id: "actor-1",
      display_name: "Subject",
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
      mode: "battle",
      world_id: null,
      current_location_id: null,
      gm_config: gmConfig,
      purpose: "validation",
    },
    params: { actorId: "actor-1", chatId: "chat-1", modelId: "mock", },
    isStory: false,
    tokenBudget: 32_000,
  };
}

describe("readValidationHarness", () => {
  test("reads a configured harness name", () => {
    expect(readValidationHarness(JSON.stringify({ validation: { harness: "eval-7", }, },),),).toBe("eval-7",);
  });

  test("returns null for absent, empty, malformed and unrelated configs", () => {
    expect(readValidationHarness(null,),).toBeNull();
    expect(readValidationHarness(undefined,),).toBeNull();
    expect(readValidationHarness(JSON.stringify({ validation: { harness: "   ", }, },),),).toBeNull();
    expect(readValidationHarness("not json",),).toBeNull();
    expect(readValidationHarness("null",),).toBeNull();
    expect(readValidationHarness(JSON.stringify({ moderation: {}, },),),).toBeNull();
    expect(readValidationHarness(JSON.stringify({ gm_profile: { kind: "llm", }, },),),).toBeNull();
  });
});

describe("validationHarnessSection", () => {
  test("registered in the prompt section pipeline", () => {
    expect(PROMPT_SECTIONS.map((s,) => s.name),).toContain("validationHarness",);
  });

  test("emits a system instruction carrying the configured harness", async () => {
    expect(validationHarnessSection.enabled(ctxWith(null,),),).toBe(true,);
    const built = await validationHarnessSection.build(
      ctxWith(JSON.stringify({ validation: { harness: "eval-7", }, },),),
    );

    expect(built.length,).toBe(1,);
    expect(built[0]!.role,).toBe("system",);
    expect(built[0]!.content,).toContain("eval-7",);
    expect(built[0]!.content,).toContain("gm_config.validation.harness",);
  });

  test("emits nothing for empty harness, other variants and malformed config", async () => {
    const configs = [
      null,
      undefined,
      JSON.stringify({ validation: { harness: "", }, },),
      JSON.stringify({ moderation: {}, },),
      JSON.stringify({ gm_profile: { kind: "llm", }, },),
      "not json",
      "null",
    ];

    for (const config of configs) {
      expect(await validationHarnessSection.build(ctxWith(config,),),).toEqual([],);
    }
  });
});

describe("PromptAssembler validation-harness wiring", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;
  let actorId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = uid();
    actorId = uid();
    chatId = uid();
    await insertUsers(db, "harness-user", "Tester", { id: userId, } as never,);
    await insertActors(db, "Subject", { id: actorId, user_id: userId, } as never,);
    await insertChats(db, "Validation chat", userId, {
      id: chatId,
      purpose: "validation",
      gm_config: JSON.stringify({ validation: { harness: "eval-7", }, },),
    },);

    await insertChatParticipants(db, chatId, actorId,);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("assemble() carries the configured harness into the LLM prompt", async () => {
    const assembled = await new PromptAssembler(db,).assemble({ actorId, chatId, modelId: "mock", },);
    expect(assembled.messages.some((m,) => m.content.includes("eval-7",)),).toBe(true,);
    expect(assembled.sections.map((s,) => s.name),).toContain("validationHarness",);
  });

  test("empty harness (variant default) leaves the prompt untouched", async () => {
    await db.updateTable("chats",)
      .set({ gm_config: JSON.stringify({ validation: { harness: "", }, },), },)
      .where("id", "=", chatId,)
      .execute();

    const assembled = await new PromptAssembler(db,).assemble({ actorId, chatId, modelId: "mock", },);
    expect(assembled.messages.some((m,) => m.content.includes("eval-7",)),).toBe(false,);
    expect(assembled.sections.map((s,) => s.name),).not.toContain("validationHarness",);
  });
});
