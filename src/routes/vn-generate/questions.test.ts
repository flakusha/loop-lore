// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for routes/vn-generate/questions.ts#questionsRoutes.
 *
 * The provider is registered for real (no mock.module — that is process-global
 * and would poison later files), so the route runs its true resolveProvider →
 * PromptAssembler → persist path. What is asserted is what a caller observes:
 * the persisted `vn_questions` rows, the minted option ids, and the count cap.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, LLMProvider, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { VN_QUESTIONS_PROMPT, } from "../../prompts/vn";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { questionsRoutes, } from "./questions";

const PROVIDER_NAME = "vn-questions-test-provider";

/** The two questions the stub provider returns, in this order. */
const LLM_QUESTIONS = [
  {
    questionType: "lore",
    questionText: "Who opened the door?",
    speakerId: "Ada",
    options: [
      { text: "I did", emotion_modifier: 5, relationship_modifier: 10, },
      { text: "Someone else", emotion_modifier: -5, relationship_modifier: -10, },
    ],
    consequences: { location: "hallway", },
    relationshipImpact: { ada: 10, },
    moodImpact: { wary: 5, },
  },
  {
    questionType: "social",
    questionText: "Do you trust her?",
    speakerId: "Kai",
    options: [{ text: "Yes", emotion_modifier: 0, relationship_modifier: 4, },],
    relationshipImpact: { kai: 4, },
    moodImpact: {},
  },
];

let capturedRequest: GenerateRequest | null = null;

/** Stub provider returning a fixed questions payload; records the request. */
function makeProvider(): LLMProvider {
  return {
    capabilities: { label: "VN Questions Test Provider", streaming: false, },
    complete: (req: GenerateRequest,) => {
      capturedRequest = req;
      return Promise.resolve({
        content: JSON.stringify({ questions: LLM_QUESTIONS, },),
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
      },);
    },
    stream: () => Promise.reject(new Error("stream unused",),),
    healthCheck: () => Promise.resolve({ status: "ok" as const, },),
    listModels: () => Promise.resolve([] as never[],),
  } as unknown as LLMProvider;
}

describe("questionsRoutes", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let chatId: string;
  let outsiderId: string;

  /** Mount the route factory under a test auth derive. */
  function makeApp(userId: string,) {
    const config = structuredClone(createConfigSchema().defaults,) as Config;
    // resolveProvider reads the name from config, then looks the instance up
    // in the registry — both halves must point at the stub.
    config.generation.defaultProvider = PROVIDER_NAME;
    config.generation.defaultModels[PROVIDER_NAME] = "stub-model";
    // The real app mounts this under /api/chats; the route itself is
    // /:id/vn/generate-questions.
    return new Elysia()
      .derive(() => ({ userId, userRole: "member", }))
      .group("/api/chats", (app,) => app.use(questionsRoutes({ database: db, config, },),),);
  }

  /** POST a generation request for the seeded chat. */
  function post(
    app: { handle: (request: Request,) => Promise<Response> },
    body: Record<string, unknown>,
    chat: string = chatId,
  ) {
    return app.handle(
      new Request(`http://localhost/api/chats/${chat}/vn/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
  }

  beforeEach(async () => {
    createLogger({ level: "error", },);
    capturedRequest = null;
    registerProvider(PROVIDER_NAME, makeProvider(),);
    ({ db, } = await createTestDb());

    ownerId = await insertUsers(db, "q-owner", "Owner", {} as never,);
    // chat_participants.actor_id must match an actors row, so pin the id.
    await insertActors(db, "Owner", {
      id: ownerId,
      user_id: ownerId,
      owner_id: ownerId,
    } as never,);

    chatId = await insertChats(db, "VN chat", ownerId, { type: "group", mode: "vn", } as never,);
    await insertChatParticipants(db, chatId, ownerId, {} as never,);

    outsiderId = await insertUsers(db, "q-outsider", "Outsider", {} as never,);
    await insertActors(db, "Outsider", { user_id: outsiderId, owner_id: outsiderId, } as never,);
  },);

  afterEach(async () => {
    unregisterProvider(PROVIDER_NAME,);
    await db.destroy();
  },);

  test("persists each generated question with server-minted option ids", async () => {
    const res = await post(makeApp(ownerId,), { sceneIndex: 4, },);

    expect(res.status,).toBe(200,);

    const rows = await db
      .selectFrom("vn_questions",)
      .select(["question_text", "question_type", "speaker_id", "scene_index", "options", "status",],)
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "asc",)
      .execute();

    expect(rows.length,).toBe(2,);
    expect(rows[0]!.question_text,).toBe("Who opened the door?",);
    expect(rows[0]!.question_type,).toBe("lore",);
    expect(rows[0]!.speaker_id,).toBe("Ada",);
    expect(rows[0]!.scene_index,).toBe(4,);
    expect(rows[0]!.status,).toBe("available",);
    expect(rows[1]!.question_text,).toBe("Do you trust her?",);

    // The LLM does not mint ids; the route must, or the answer endpoint's
    // optionId lookup has nothing to match.
    const options = JSON.parse(rows[0]!.options,) as { id: string; text: string }[];
    expect(options.map((o,) => o.text),).toEqual(["I did", "Someone else",],);
    for (const option of options) {
      expect(typeof option.id,).toBe("string",);
      expect(option.id.length,).toBeGreaterThan(0,);
    }

    // Distinct across options, or one answer would resolve to both.
    expect(options[0]!.id,).not.toBe(options[1]!.id,);
  });

  test("the response reports the generated questions and the scene", async () => {
    const res = await post(makeApp(ownerId,), { sceneIndex: 2, },);
    const body = await res.json() as {
      data: { questions: { questionText?: string }[]; sceneIndex: number };
    };

    expect(res.status,).toBe(200,);
    expect(body.data.sceneIndex,).toBe(2,);
    expect(body.data.questions.length,).toBe(2,);
  });

  test("count caps both the response and the persisted rows", async () => {
    const res = await post(makeApp(ownerId,), { sceneIndex: 0, count: 1, },);
    const body = await res.json() as { data: { questions: unknown[] } };

    expect(res.status,).toBe(200,);
    expect(body.data.questions.length,).toBe(1,);

    const rows = await db
      .selectFrom("vn_questions",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(rows.length,).toBe(1,);
  });

  test("defaults to two questions when count is omitted", async () => {
    await post(makeApp(ownerId,), { sceneIndex: 0, },);

    const rows = await db
      .selectFrom("vn_questions",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(rows.length,).toBe(2,);
  });

  test("sends VN_QUESTIONS_PROMPT as the system instruction to the provider", async () => {
    await post(makeApp(ownerId,), { sceneIndex: 0, },);

    // The provider is the observable boundary: if the route assembled a
    // different prompt (or none), generation would drift from the contract.
    expect(capturedRequest,).not.toBeNull();
    const request = capturedRequest;
    if (!request) { throw new Error("provider was never called",); }
    const systemMessages = request.messages.filter((m,) => m.role === "system");
    expect(systemMessages.some((m,) => m.content.includes(VN_QUESTIONS_PROMPT,)),).toBe(true,);
  });

  test("passes the scene index and optional hints into the user turn", async () => {
    await post(makeApp(ownerId,), {
      sceneIndex: 6,
      questionType: "combat",
      context: "A locked door",
    },);

    const request = capturedRequest;
    if (!request) { throw new Error("provider was never called",); }
    const userTurn = [...request.messages,].reverse().find((m,) => m.role === "user");
    expect(userTurn?.content,).toContain("scene index 6",);
    expect(userTurn?.content,).toContain("Question type: combat.",);
    expect(userTurn?.content,).toContain("Context: A locked door",);
  });

  test("a non-participant is forbidden and generates nothing", async () => {
    const res = await post(makeApp(outsiderId,), { sceneIndex: 0, },);

    expect(res.status,).toBe(403,);
    const rows = await db
      .selectFrom("vn_questions",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(rows.length,).toBe(0,);
    expect(capturedRequest,).toBeNull();
  });

  test("an unknown chat is forbidden rather than generating", async () => {
    const res = await post(makeApp(ownerId,), { sceneIndex: 0, }, "no-such-chat",);

    expect(res.status,).toBe(403,);
    expect(capturedRequest,).toBeNull();
  });
});
