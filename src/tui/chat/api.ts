// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeFetch as _realFetch, safeJsonStringify, } from "../../utils";
import type { ChatHost, ChatMessage, } from "./types";

export const API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000";

let _fetch = _realFetch;

/** Swap the HTTP client (tests only) — mirrors the seam in `harness/api.ts`.
 * @param fn - replacement for the real `safeFetch`
 */
export function setFetch(fn: typeof _realFetch,): void {
  _fetch = fn;
}

/**
 * Send message via POST /api/chats/:id/messages.
 * Shows typing indicator, adds user message + assistant auto-reply.
 * @param host
 * @param text
 * @returns {Promise<void>}
 */
export async function handleSend(host: ChatHost, text: string,): Promise<void> {
  if (!host.chatId) {
    host.showError("No active chat. Create or select a chat first.",);
    return;
  }

  if (host.isSending) { return; }

  host.isSending = true;
  host.showTyping();

  try {
    const bodyResult = safeJsonStringify({ content: text, role: "user", },);
    const result = await _fetch<{
      id: string;
      assistantMessage?: { id: string; content: string };
    }>(`${API_BASE}/api/v1/chats/${host.chatId}/messages`, {
      method: "POST",
      auth: host.sessionToken ? { sessionToken: host.sessionToken, } : undefined,
      body: bodyResult.ok ? bodyResult.value : "{}",
      handle401: false,
      // This POST blocks on a whole assistant generation server-side, so the
      // shared 30s safeFetch default would abort turns the server completes.
      timeout: host.sendTimeoutMs,
    },);

    host.hideTyping();

    if (!result.ok) {
      host.showError(result.error.message,);
      return;
    }

    const data = result.data;

    // Add user message
    host.addMessage({ id: data.id, role: "user", content: text, },);

    // Add assistant auto-reply if present
    if (data.assistantMessage) {
      host.addMessage({
        id: data.assistantMessage.id,
        role: "assistant",
        content: data.assistantMessage.content,
      },);
    }
  } catch (error) {
    host.hideTyping();
    host.showError(`Network error: ${(error as Error).message}`,);
  } finally {
    host.isSending = false;
    host.screen.render();
  }
}

/**
 * Load messages from GET /api/chats/:id/messages with cursor-based pagination
 * @param host
 * @returns {Promise<void>}
 */
export async function loadMessages(host: ChatHost,): Promise<void> {
  if (!host.chatId) { return; }
  try {
    const url = host.cursor
      ? `${API_BASE}/api/v1/chats/${host.chatId}/messages?pageSize=200&cursor=${host.cursor}`
      : `${API_BASE}/api/v1/chats/${host.chatId}/messages?pageSize=200`;

    const result = await _fetch<{ data: ChatMessage[]; cursor: string | null }>(url, {
      auth: host.sessionToken ? { sessionToken: host.sessionToken, } : undefined,
      handle401: false,
    },);

    if (!result.ok) {
      host.showError(
        result.status !== undefined
          ? `Failed to load messages (HTTP ${result.status})`
          : `Network error loading messages: ${result.error.message}`,
      );

      return;
    }

    const data = result.data;
    host.cursor = data.cursor ?? host.cursor;
    // Prepend older messages (cursor fetches older)
    host.messages = host.messages.length > 0 ? [...data.data, ...host.messages,] : data.data;
    host.itemCount = host.messages.length;
    host.scrollToBottom();
  } catch (error) {
    host.showError(`Network error loading messages: ${(error as Error).message}`,);
  }
}
