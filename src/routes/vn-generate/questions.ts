// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Q&A question generation — helper + POST /api/chats/:id/vn/generate-questions.
 *
 * Mirrors ./choices.ts step for step (assembler → system prompt → provider →
 * complete → parse) and, critically, PERSISTS the generated questions before
 * returning so `GET /api/chats/:id/vn-questions?sceneIndex=N` can list them —
 * the choices path carries a BUG comment for the same reason.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { PromptAssembler, } from "../../assistant/prompt-assembler";
import { checkChatAccess, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveProvider, } from "../../generation/providers/registry";
import { getLogger, type Logger, } from "../../logger";
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, jsonStringifyOr, uid, } from "../../utils";
import { forbidden, } from "../../validation/middleware";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type {
  GenerateQuestionsBody,
  QuestionGenerationResult,
  VnGenerateRouteOpts,
} from "./types";

/** */
function log(): Logger {
  return getLogger().child({ module: "vn-generate-questions", },);
}

// ── Question Generation ──────────────────────────────────────

/**
 * @param database
 * @param chatId
 * @param body
 * @param config
 * @param userId
 */
async function generateVnQuestions(
  database: Kysely<DB>,
  chatId: string,
  body: GenerateQuestionsBody,
  config: Config,
  userId: string,
): Promise<QuestionGenerationResult> {
  const assembler = new PromptAssembler(database,);

  // First actor in chat anchors the prompt assembly (same lookup as choices).
  const firstParticipant = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .where("chat_participants.chat_id", "=", chatId,)
    .select("actors.id",)
    .limit(1,)
    .executeTakeFirst();

  const actorId = firstParticipant?.id ?? "";

  const assembled = await assembler.assemble({
    chatId,
    actorId,
    modelId: "default",
    userId,
    systemPromptOverride: resolveSystemPrompt(config.templates.llm, "vnQuestions",),
    includeStoryContext: true,
    includeExamples: false,
    config,
    task: "vn-question",
  },);

  const questionCount = body.count ?? 2;
  const typeInstruction = body.questionType
    ? `\n\nQuestion type: ${body.questionType}.`
    : "";

  const contextInstruction = body.context
    ? `\n\nContext: ${body.context}`
    : "";

  const messages = [
    ...assembled.messages,
    {
      role: "user" as const,
      content:
        `Generate ${questionCount} in-character question(s) a character may ask the player at scene index ${body.sceneIndex}.${typeInstruction}${contextInstruction}\n\nRespond in JSON format:\n{\n  "questions": [\n    {\n      "question_type": "lore",\n      "question_text": "The question as spoken",\n      "options": [\n        { "text": "Answer text", "emotion_modifier": 0, "relationship_modifier": 0 }\n      ],\n      "consequences": {},\n      "relationship_impact": {},\n      "mood_impact": {}\n    }\n  ]\n}`,
    },
  ];

  const resolved = await resolveProvider({ config, userId, db: database, },);

  const response = await resolved.provider.complete({
    model: resolved.resolvedModel,
    messages,
    apiKey: resolved.resolvedApiKey,
    params: {
      temperature: 0.9,
      maxTokens: body.maxTokens ?? 800,
    },
  },);

  const parsed = jsonParseOr<{
    questions: QuestionGenerationResult["questions"];
  }>(response.content, { questions: [], },);

  return {
    questions: parsed.questions.slice(0, questionCount,),
    sceneIndex: body.sceneIndex,
    metadata: {
      model: resolved.resolvedModel,
      provider: resolved.resolvedProviderName,
    },
  };
}

const QuestionsTypeSchema = t.Optional(t.Union([
  t.Literal("lore",),
  t.Literal("relationship",),
  t.Literal("combat",),
  t.Literal("exploration",),
  t.Literal("social",),
],),);

const QuestionsBodySchema = t.Object({
  sceneIndex: t.Number(),
  count: t.Optional(t.Number(),),
  context: t.Optional(t.String(),),
  questionType: QuestionsTypeSchema,
  maxTokens: t.Optional(t.Number(),),
},);

/**
 * @param opts
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { ":id": { vn: { "generate-questions": { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function questionsRoutes(opts: VnGenerateRouteOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "vn-generate-questions", },)
      .post(
        "/:id/vn/generate-questions",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id: chatId, } = ctx.params as { id: string };
          const access = await checkChatAccess(database, chatId, userId, ctx.userRole as string | null,);
          if (!access.ok) { return forbidden(); }

          const body = ctx.body as GenerateQuestionsBody;

          try {
            const result = await generateVnQuestions(
              database,
              chatId,
              body,
              opts.config,
              userId,
            );

            // Persist every generated question so the FE's
            // GET /api/chats/:id/vn-questions?sceneIndex=N can list it. Option
            // ids are assigned here — the LLM does not mint stable ids.
            const questions = result.questions ?? [];
            for (const question of questions) {
              const options = (question.options ?? []).map((option,) => ({
                ...option,
                id: uid(),
              }));

              await database
                .insertInto("vn_questions",)
                .values({
                  id: uid(),
                  chat_id: chatId,
                  scene_index: result.sceneIndex ?? body.sceneIndex,
                  question_type: question.questionType ?? body.questionType ?? "lore",
                  question_text: question.questionText ?? "Untitled question",
                  speaker_id: question.speakerId ?? null,
                  options: jsonStringifyOr(options, "[]",),
                  next_scene_id: question.nextSceneId ?? null,
                  consequences: jsonStringifyOr(question.consequences ?? {},),
                  relationship_impact: jsonStringifyOr(question.relationshipImpact ?? {},),
                  mood_impact: jsonStringifyOr(question.moodImpact ?? {},),
                  created_at: new Date().toISOString(),
                },)
                .execute();
            }

            log().info("Persisted generated VN questions", {
              chatId,
              sceneIndex: result.sceneIndex ?? body.sceneIndex,
              count: questions.length,
            },);

            return jsonResponse({ data: result, },);
          } catch (err) {
            // Logged, not swallowed: a mid-loop insertInto failure leaves earlier
            // questions committed, and a bare 500 gives no way to tell that apart
            // from "generation produced nothing".
            log().error("vn question generation failed", err instanceof Error ? err : new Error(String(err,),), {
              chatId,
            },);

            return jsonError("Generation failed", 500,);
          }
        },
        {
          body: QuestionsBodySchema,
          params: t.Object({ id: t.String(), },),
        },
      )
  );
}
