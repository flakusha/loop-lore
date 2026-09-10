// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt improvement route handler.
 *
 * `POST /api/generation/prompt` — unified "improve my prompt" REST surface
 * backing the composer UI. Two modes: `improve` (gradation levels, optional
 * chat-style binding) and `analyze` (intent/clarity profile). Auth required;
 * `chatId`-scoped calls pass `checkChatAccess` (BUG-generation-control-plane-
 * routes-lack-authorization parity).
 */
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../chat/service";
import { loadConfig, } from "../config/load";
import { MessageVisibility, } from "../db/enums-core/messages";
import { getDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import {
  analyzePrompt,
  improveOrPolish,
  type PromptImproveLevel,
} from "../prompt-improve";
import { forbiddenResponse, } from "../routes/http-utils";
import { detectInjectionSignals, } from "../validation/prompt-injection";

const STYLE_CONTEXT_MESSAGES = 5;
const STYLE_CONTEXT_MAX_CHARS = 2000;

const IMPROVE_LEVELS: readonly PromptImproveLevel[] = [
  "spellcheck",
  "wording",
  "expand",
  "strict",
  "creative",
  "style-chat",
  "style-group",
];

const STYLE_LEVELS: readonly PromptImproveLevel[] = ["style-chat", "style-group",];

interface PromptBody {
  mode?: "improve" | "analyze";
  level?: string;
  text: string;
  chatId?: string;
}

/**
 * @param body
 * @param database
 * @param userId
 * @param userRole
 */
export async function handlePromptImprove(
  body: unknown,
  database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const log = getLogger().child({ module: "generation/prompt-route", },);
  const req = body as PromptBody;

  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }
  if (!req || typeof req.text !== "string" || req.text.trim().length === 0) {
    return Response.json({ error: "Missing required field: text", status: 400, }, { status: 400, },);
  }
  const mode = req.mode ?? "improve";
  if (mode !== "improve" && mode !== "analyze") {
    return Response.json({ error: "Invalid mode; expected improve or analyze", status: 400, }, { status: 400, },);
  }

  const level: PromptImproveLevel | null = mode === "improve"
    ? (req.level as PromptImproveLevel | undefined) ?? "wording"
    : null;
  if (level && !IMPROVE_LEVELS.includes(level,)) {
    return Response.json({
      error: `Invalid level; expected one of: ${IMPROVE_LEVELS.join(", ",)}`,
      status: 400,
    }, { status: 400, },);
  }

  // Authorization: when scoped to a chat, only admin, creator, or a
  // participant may improve text within it.
  if (req.chatId) {
    const dbForAccess = database ?? getDatabase();
    const access = await checkChatAccess(dbForAccess, req.chatId, userId, userRole,);
    if (!access.ok) { return forbiddenResponse(); }
  }

  // Deterministic injection scan on the outbound draft — a strong signal set
  // refuses to launder the text through the improvement LLM.
  const injection = detectInjectionSignals(req.text,);
  if (injection.score >= 5) {
    log.warn("Prompt-improve input rejected by injection scan", {
      chatId: req.chatId,
      signals: injection.signals,
    },);
    return Response.json({
      error: "injection_detected",
      message: "Text rejected: prompt injection detected.",
      status: 403,
    }, { status: 403, },);
  }

  const config = loadConfig();
  const db = getDatabase();

  const styleContext = level && STYLE_LEVELS.includes(level,) && req.chatId
    ? await buildStyleContext(db, req.chatId,)
    : undefined;

  if (mode === "analyze") {
    const analysis = await analyzePrompt({ text: req.text, config, db, userId, chatId: req.chatId, },);
    if (!analysis) {
      return Response.json({ error: "No auxiliary model configured", status: 503, }, { status: 503, },);
    }
    return Response.json({ data: { mode, analysis, }, },);
  }

  const result = await improveOrPolish({
    level: level ?? "wording",
    text: req.text,
    styleContext,
    config,
    db,
    userId,
    chatId: req.chatId,
  },);
  return Response.json({
    data: {
      mode,
      level,
      content: result.content,
      model: result.model,
      provider: result.provider,
      latencyMs: result.latencyMs,
      localFallback: result.model === "local-heuristics",
    },
  },);
}

/**
 * Build a style reference from the chat's recent visible messages so
 * `style-*` levels rewrite in the chat's voice.
 * @param db
 * @param chatId
 */
async function buildStyleContext(db: Kysely<DB>, chatId: string,): Promise<string | undefined> {
  const rows = await db
    .selectFrom("messages",)
    .select(["content", "role",],)
    .where("chat_id", "=", chatId,)
    .where("visibility", "=", MessageVisibility.Visible,)
    .orderBy("created_at", "desc",)
    .limit(STYLE_CONTEXT_MESSAGES,)
    .execute();
  const samples = rows.reverse().map((r,) => `${r.role}: ${r.content}`);
  const styleContext = samples.join("\n---\n",).slice(0, STYLE_CONTEXT_MAX_CHARS,);
  return styleContext.length > 0 ? styleContext : undefined;
}
