// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeFetch as _realFetch, safeJsonStringify, } from "../../utils";
import type { ChatHost, ChatMessage, } from "./types";

export const API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000";

/** One row of GET /api/v1/commands, narrowed to what the TUI renders. */
export interface CommandDescriptor {
  name: string;
  descriptionKey: string;
  /** Minimum participant role, when the registry pins one (display-only). */
  requiredRole?: string;
}

/** Envelope shape returned by GET /api/v1/commands. */
export interface CommandsEnvelope {
  data: CommandDescriptor[];
}

/** Result of a command-registry fetch, mirroring the harness API module. */
export type CommandListResult =
  | { ok: true; data: CommandDescriptor[] }
  | { ok: false; error: string };

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

/**
 * Fetch the live slash-command registry.
 *
 * Served by `commandsRoutes` (src/routes/commands/index.ts), mounted under
 * /api/v1 by the admin-surface barrel. Auth-gated like every assistant route;
 * `chatId` is passed only so the route can echo the caller's role hint.
 * @param sessionToken - bearer token; omit to run anonymous
 * @param chatId - active chat, for the route's display-only role hint
 * @returns the registry, or an error message to surface in place of the strip
 */
export async function loadCommands(
  sessionToken: string | undefined,
  chatId: string | null,
): Promise<CommandListResult> {
  try {
    const query = chatId ? `?chatId=${encodeURIComponent(chatId,)}` : "";
    const result = await _fetch<CommandsEnvelope>(`${API_BASE}/api/v1/commands${query}`, {
      auth: sessionToken ? { sessionToken, } : undefined,
      handle401: false,
    },);

    if (!result.ok) { return { ok: false, error: `HTTP ${result.status}`, }; }

    return { ok: true, data: result.data.data ?? [], };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }
}
