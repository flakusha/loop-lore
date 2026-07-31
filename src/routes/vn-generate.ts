/**
 * VN Dynamic Generation Routes
 *
 * POST /api/chats/:chatId/vn/generate-story — generate story descriptions
 * POST /api/chats/:chatId/vn/generate-choices — generate branching choices
 */

import type { Kysely, } from "kysely";
import { Elysia, t, } from "elysia";
import { PromptAssembler, } from "../assistant/prompt-assembler";
import type { DB, } from "../db/schema";
import type { Config, } from "../config/schema";
import { jsonError, jsonResponse, } from "./http-utils";
import { resolveProvider, } from "../generation/providers/registry";
import { jsonParseOr, } from "../utils";

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

const STORY_SYSTEM_PROMPT = `You are a Visual Novel story narrator. Generate immersive, atmospheric prose for visual novel scenes.

Style guidelines:
- Use vivid sensory details (sight, sound, touch, smell)
- Write in present tense for immediacy
- Keep paragraphs short (2-4 sentences) for VN readability
- Include character actions and reactions in *asterisk notation*
- Maintain consistency with established characters and locations
- End with a natural transition point for the next scene`;

const CHOICES_SYSTEM_PROMPT = `You are a Visual Novel branching narrative designer. Generate meaningful player choices that affect the story.

Choice guidelines:
- Each choice should lead to meaningfully different outcomes
- Include both safe and risky options
- Consider character relationships and story consequences
- Keep labels concise (3-8 words) but descriptive
- Provide brief descriptions of potential outcomes
- Balance player agency with narrative coherence`;

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
    systemPromptOverride: STORY_SYSTEM_PROMPT,
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
      content: `Generate a scene description for scene index ${body.sceneIndex}.${styleInstruction}${contextInstruction}\n\nWrite 2-4 paragraphs of atmospheric VN prose.`, 
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
    systemPromptOverride: CHOICES_SYSTEM_PROMPT,
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
      content: `Generate ${choiceCount} branching choices for scene index ${body.sceneIndex}.${styleInstruction}${contextInstruction}\n\nRespond in JSON format:\n{\n  "choices": [\n    {\n      "label": "Choice label (3-8 words)",\n      "description": "Brief outcome description",\n      "consequences": {},\n      "relationship_impact": {},\n      "mood_impact": {}\n    }\n  ]\n}`,
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
  const { database, config, } = opts;

  return new Elysia({ prefix: "/api/chats", },)
    .post(
      "/:chatId/vn/generate-story",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return jsonError("Unauthorized", 401,);
        }

        const { chatId, } = ctx.params as { chatId: string };
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
        params: t.Object({ chatId: t.String(), },),
      },
    )
    .post(
      "/:chatId/vn/generate-choices",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return jsonError("Unauthorized", 401,);
        }

        const { chatId, } = ctx.params as { chatId: string };
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
        params: t.Object({ chatId: t.String(), },),
      },
    );
}
