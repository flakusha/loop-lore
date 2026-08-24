// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN branching-choice generation — helper + POST /api/chats/:id/vn/generate-choices.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { PromptAssembler, } from "../../assistant/prompt-assembler";
import { checkChatAccess, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveProvider, } from "../../generation/providers/registry";
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, } from "../../utils";
import { forbidden, } from "../../validation/middleware";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { ChoiceGenerationResult, GenerateChoicesBody, VnGenerateRouteOpts, } from "./types";

// ── Prompt Templates ───────────────────────────────────────
// VN system prompts live in src/prompts/vn.ts (registry defaults); the
// resolver overlays user overrides from configs/templates/llm.yaml.

// ── Choice Generation ──────────────────────────────────────

async function generateBranchingChoices(
  database: Kysely<DB>,
  chatId: string,
  body: GenerateChoicesBody,
  config: Config,
  userId: string,
): Promise<ChoiceGenerationResult> {
  const assembler = new PromptAssembler(database,);

  // Get first actor in chat for prompt assembly
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
    systemPromptOverride: resolveSystemPrompt(config.templates.llm, "vnChoices",),
    includeStoryContext: true,
    includeExamples: false,
    config,
    task: "vn-choice",
  },);

  const choiceCount = body.count ?? 3;
  const styleInstruction = body.style
    ? `\n\nStyle: ${body.style} choices.`
    : "";

  const contextInstruction = body.context
    ? `\n\nContext: ${body.context}`
    : "";

  const messages = [
    ...assembled.messages,
    {
      role: "user" as const,
      content:
        `Generate ${choiceCount} branching choices for scene index ${body.sceneIndex}.${styleInstruction}${contextInstruction}\n\nRespond in JSON format:\n{\n  "choices": [\n    {\n      "label": "Choice label (3-8 words)",\n      "description": "Brief outcome description",\n      "consequences": {},\n      "relationship_impact": {},\n      "mood_impact": {}\n    }\n  ]\n}`,
    },
  ];

  // Resolve provider
  const resolved = await resolveProvider({
    config,
    userId,
    db: database,
  },);

  // Call LLM
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
    choices: ChoiceGenerationResult["choices"];
  }>(response.content, { choices: [], },);

  return {
    choices: parsed.choices.slice(0, choiceCount,),
    sceneIndex: body.sceneIndex,
    metadata: {
      model: resolved.resolvedModel,
      provider: resolved.resolvedProviderName,
    },
  };
}

const ChoicesStyleSchema = t.Optional(t.Union([
  t.Literal("free",),
  t.Literal("guided",),
  t.Literal("constrained",),
],),);

const ChoicesBodySchema = t.Object({
  sceneIndex: t.Number(),
  count: t.Optional(t.Number(),),
  context: t.Optional(t.String(),),
  style: ChoicesStyleSchema,
  maxTokens: t.Optional(t.Number(),),
},);

export function choicesRoutes(opts: VnGenerateRouteOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "vn-generate-choices", },)
      .post(
        "/:id/vn/generate-choices",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id: chatId, } = ctx.params as { id: string };
          const access = await checkChatAccess(database, chatId, userId, ctx.userRole as string | null,);
          if (!access.ok) { return forbidden(); }

          const body = ctx.body as GenerateChoicesBody;

          try {
            const result = await generateBranchingChoices(
              database,
              chatId,
              body,
              opts.config,
              userId,
            );

            return jsonResponse({ data: result, },);
          } catch {
            return jsonError("Generation failed", 500,);
          }
        },
        {
          body: ChoicesBodySchema,
          params: t.Object({ id: t.String(), },),
        },
      )
  );
}
