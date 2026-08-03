/**
 * VN Dynamic Generation Routes
 *
 * POST /api/chats/:chatId/vn/generate-story — generate story descriptions
 * POST /api/chats/:chatId/vn/generate-choices — generate branching choices
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { PromptAssembler, } from "../assistant/prompt-assembler";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { resolveProvider, } from "../generation/providers/registry";
import { resolveSystemPrompt, } from "../prompts";
import { jsonParseOr, } from "../utils";
import { jsonError, jsonResponse, } from "./http-utils";

// ── Types ──────────────────────────────────────────────────

interface GenerateStoryBody {
  sceneIndex: number;
  locationId?: string;
  characterIds?: string[];
  context?: string;
  style?: "narration" | "dialogue" | "action" | "description";
  maxTokens?: number;
}

interface GenerateChoicesBody {
  sceneIndex: number;
  count?: number;
  context?: string;
  style?: "free" | "guided" | "constrained";
  maxTokens?: number;
}

interface StoryGenerationResult {
  content: string;
  sceneIndex: number;
  metadata: {
    model?: string;
    provider?: string;
    tokens?: number;
  };
}

interface ChoiceGenerationResult {
  choices: Array<{
    label: string;
    description: string;
    consequences?: Record<string, unknown>;
    relationshipImpact?: Record<string, unknown>;
    moodImpact?: Record<string, unknown>;
  }>;
  sceneIndex: number;
  metadata: {
    model?: string;
    provider?: string;
    tokens?: number;
  };
}

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

// ── Route Registration ─────────────────────────────────────

export interface VnGenerateRouteOpts {
  database: Kysely<DB>;
  config: Config;
}

export function vnGenerateRoutes(opts: VnGenerateRouteOpts,) {
  const { database, } = opts;

  return new Elysia({ prefix: "/api/chats", },)
    .post(
      "/:id/vn/generate-story",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return jsonError("Unauthorized", 401,);
        }

        const { id: chatId, } = ctx.params as { id: string };
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
        body: t.Object({
          sceneIndex: t.Number(),
          locationId: t.Optional(t.String(),),
          characterIds: t.Optional(t.Array(t.String(),),),
          context: t.Optional(t.String(),),
          style: t.Optional(t.Union([
            t.Literal("narration",),
            t.Literal("dialogue",),
            t.Literal("action",),
            t.Literal("description",),
          ],),),
          maxTokens: t.Optional(t.Number(),),
        },),
        params: t.Object({ id: t.String(), },),
      },
    )
    .post(
      "/:id/vn/generate-choices",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return jsonError("Unauthorized", 401,);
        }

        const { id: chatId, } = ctx.params as { id: string };
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
        body: t.Object({
          sceneIndex: t.Number(),
          count: t.Optional(t.Number(),),
          context: t.Optional(t.String(),),
          style: t.Optional(t.Union([
            t.Literal("free",),
            t.Literal("guided",),
            t.Literal("constrained",),
          ],),),
          maxTokens: t.Optional(t.Number(),),
        },),
        params: t.Object({ id: t.String(), },),
      },
    );
}
