/**
 * write_memory_note — builtin tool for durable, LLM-initiated memory writes.
 *
 * 0.1.0 Quick Win item 2 (matrix gap G23, RisuAI dynamic-memory inspiration):
 * the assistant can emit a durable memory note mid-response via a tool call.
 * Complements the regex extraction pipeline (`src/memory/extraction.ts`) with
 * an explicit, model-directed path.
 *
 * The handler reuses `storeMemories` — same semantics as background extraction:
 * dedupe by (actor_id, content), `source_chat_id` set, scope "character",
 * privacy "shared". The execution context (db + actor + chat) is supplied by
 * `executeToolCalls` at generation time; the registered definition is static.
 */
import { MemoryType, } from "../../db/enums";
import { storeMemories, } from "../../memory";
import type { ToolDefinition, ToolResult, } from "../../plugins/types";
import { jsonStringifyOr, } from "../../utils";

/** Canonical tool name — referenced by executeToolCalls. */
export const WRITE_MEMORY_NOTE = "write_memory_note";

/** Maximum note length — keeps a single memory row within the budget. */
export const MEMORY_NOTE_MAX_CHARS = 2000;

/** JSON Schema parameters exposed to the model. */
const PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {
    content: {
      type: "string",
      description: "The durable memory note to remember (fact, preference, or event worth recalling later).",
    },
    memoryType: {
      type: "string",
      enum: ["episodic", "semantic", "procedural",],
      description: "Memory kind; defaults to episodic.",
    },
    importance: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Recall priority 0..1 (default 0.5).",
    },
    keywords: {
      type: "array",
      items: { type: "string", },
      description: "Optional retrieval keywords.",
    },
  },
  required: ["content",],
  additionalProperties: false,
};

/**
 * The builtin memory-write tool definition. Registered at plugin load time
 * (core origin) so the model sees it; executed with per-request context.
 */
export const writeMemoryNoteTool: ToolDefinition = {
  name: WRITE_MEMORY_NOTE,
  description:
    "Store a durable memory note for this conversation (fact, preference, or event worth recalling later). Use sparingly for information that should persist beyond the chat.",
  parameters: PARAMETERS,
  handler: async (params, ctx,): Promise<ToolResult> => {
    const content = typeof params.content === "string" ? params.content.trim() : "";
    if (!content) {
      return { content: '{"error":"content is required and must be non-empty"}', isError: true, };
    }
    if (content.length > MEMORY_NOTE_MAX_CHARS) {
      return { content: `{"error":"content exceeds ${MEMORY_NOTE_MAX_CHARS} chars"}`, isError: true, };
    }
    if (!ctx) {
      return { content: '{"error":"memory tool requires generation context"}', isError: true, };
    }

    const rawType = params.memoryType;
    const memoryType = typeof rawType === "string" &&
        [MemoryType.Episodic, MemoryType.Semantic, MemoryType.Procedural,].includes(rawType as MemoryType,)
      ? (rawType as MemoryType)
      : MemoryType.Episodic;
    const rawImportance = params.importance;
    const importance = typeof rawImportance === "number" && rawImportance >= 0 && rawImportance <= 1
      ? rawImportance
      : 0.5;
    const rawKeywords = params.keywords;
    const keywords: string[] = [];
    if (Array.isArray(rawKeywords,)) {
      for (const k of rawKeywords) {
        if (typeof k === "string") { keywords.push(k,); }
      }
    }

    const stored = await storeMemories(ctx.db, ctx.actorId, ctx.chatId, [
      {
        content,
        memoryType,
        importance,
        confidence: 1,
        keywords,
      },
    ],);

    return {
      content: jsonStringifyOr({ ok: true, stored, memoryType, },),
      metadata: { stored, memoryType, },
    };
  },
};
