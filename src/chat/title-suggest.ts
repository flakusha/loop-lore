// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Title Suggestions
 *
 * Advisory-only AUX titles for untitled chats. Never throws, never blocks
 * the chat path — callers fire-and-forget and fall back to the rule-based
 * title when AUX is unavailable.
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../aux-pipeline";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { getLogger, } from "../logger";

const FALLBACK_TITLE = "New chat";
const FALLBACK_MAX = 40;
const AUX_MAX = 60;

/**
 * Rule-based fallback title: trim, collapse whitespace, slice to 40 chars
 * with an ellipsis when longer, "New chat" on empty.
 * @param text - First message text (or any raw input)
 */
export function deriveChatTitleFallback(text: string,): string {
  const collapsed = text.replace(/\s+/g, " ",).trim();
  if (!collapsed) { return FALLBACK_TITLE; }
  return collapsed.length <= FALLBACK_MAX ? collapsed : `${collapsed.slice(0, FALLBACK_MAX,)}…`;
}

/**
 * Suggest a short chat title via the shared AUX runner. Returns trimmed AUX
 * content (capped at 60 chars) or the rule-based fallback on null/throw.
 * Advisory-only: never throws.
 * @param args - Config, db, optional user/chat ids, and the first message
 */
export async function suggestChatTitle(args: {
  config: Config;
  db: Kysely<DB>;
  userId?: string;
  chatId?: string;
  firstMessage: string;
},): Promise<string> {
  const fallback = deriveChatTitleFallback(args.firstMessage,);
  try {
    const messages: GenerationMessage[] = [
      { role: "system", content: "Generate a short chat title (<=40 chars).", },
      { role: "user", content: args.firstMessage, },
    ];
    const result = await callAux("chat-title", args.config, args.db, messages, {
      maxTokens: 20,
      timeoutMs: 2000,
      userId: args.userId,
      chatId: args.chatId,
    },);
    const title = result?.content.trim();
    if (!title) { return fallback; }
    return title.length <= AUX_MAX ? title : `${title.slice(0, AUX_MAX,)}…`;
  } catch (error) {
    getLogger()
      .child({ module: "chat-title", },)
      .debug("chat title suggestion failed, using fallback", {
        error: (error as Error).message,
      },);
    return fallback;
  }
}
