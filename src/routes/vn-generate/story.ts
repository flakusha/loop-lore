/**
 * VN story description generation — helper + POST /api/chats/:id/vn/generate-story.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { PromptAssembler, } from "../../assistant/prompt-assembler";
import { checkChatAccess, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveProvider, } from "../../generation/providers/registry";
import { resolveSystemPrompt, } from "../../prompts";
import { forbidden, } from "../../validation/middleware";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { GenerateStoryBody, StoryGenerationResult, VnGenerateRouteOpts, } from "./types";

// ── Prompt Templates ───────────────────────────────────────
// VN system prompts live in src/prompts/vn.ts (registry defaults); the
// resolver overlays user overrides from configs/templates/llm.yaml.

// ── Story Generation ───────────────────────────────────────

async function generateStoryDescription(
  database: Kysely<DB>,
  chatId: string,
  body: GenerateStoryBody,
  config: Config,
  userId: string,
): Promise<StoryGenerationResult> {
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
    systemPromptOverride: resolveSystemPrompt(config.templates.llm, "vn",),
    includeStoryContext: true,
    includeExamples: false,
    config,
  },);

  const styleInstruction = body.style
    ? `\n\nFocus on ${body.style} style writing.`
    : "";

  const contextInstruction = body.context
    ? `\n\nAdditional context: ${body.context}`
    : "";

  const messages = [
    ...assembled.messages,
    {
      role: "user" as const,
      content:
        `Generate a scene description for scene index ${body.sceneIndex}.${styleInstruction}${contextInstruction}\n\nWrite 2-4 paragraphs of atmospheric VN prose.`,
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
      temperature: 0.8,
      maxTokens: body.maxTokens ?? 500,
    },
  },);

  return {
    content: response.content,
    sceneIndex: body.sceneIndex,
    metadata: {
      model: resolved.resolvedModel,
      provider: resolved.resolvedProviderName,
    },
  };
}

const StoryStyleSchema = t.Optional(t.Union([
  t.Literal("narration",),
  t.Literal("dialogue",),
  t.Literal("action",),
  t.Literal("description",),
],),);

const StoryCharacterIdsSchema = t.Optional(t.Array(t.String(),),);

const StoryBodySchema = t.Object({
  sceneIndex: t.Number(),
  locationId: t.Optional(t.String(),),
  characterIds: StoryCharacterIdsSchema,
  context: t.Optional(t.String(),),
  style: StoryStyleSchema,
  maxTokens: t.Optional(t.Number(),),
},);

export function storyRoutes(opts: VnGenerateRouteOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "vn-generate-story", },)
      .post(
        "/:id/vn/generate-story",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const { id: chatId, } = ctx.params as { id: string };
          const access = await checkChatAccess(database, chatId, userId, ctx.userRole as string | null,);
          if (!access.ok) { return forbidden(); }

          const body = ctx.body as GenerateStoryBody;

          try {
            const result = await generateStoryDescription(
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
          body: StoryBodySchema,
          params: t.Object({ id: t.String(), },),
        },
      )
  );
}
