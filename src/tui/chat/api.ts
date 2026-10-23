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
    }>(`${API_BASE}/api/v1/chats/${encodeURIComponent(host.chatId,)}/messages`, {
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

    // Add assistant auto-reply if present. With an LLM configured the server
    // returns 201 without it (reply arrives over SSE, which the TUI lacks) —
    // refresh the transcript so the reply appears without a manual F5.
    if (data.assistantMessage) {
      host.addMessage({
        id: data.assistantMessage.id,
        role: "assistant",
        content: data.assistantMessage.content,
      },);
    } else {
      await loadMessages(host,);
    }
  } catch (error) {
    host.hideTyping();
    host.showError(`Network error: ${(error as Error).message}`,);
  } finally {
    host.isSending = false;
    host.screen.render();
  }
}

/** Rows per page. The widget renders one page — the newest one. */
const PAGE_SIZE = 200;

/** One page of GET /api/v1/chats/:id/messages, as `jsonPaginated` shapes it. */
interface MessagesPage {
  data: ChatMessage[];
  pagination?: {
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
  };
}

/** Result of one page fetch; the failure arm carries the line to render. */
type PageFetch = { ok: true; page: MessagesPage } | { ok: false; message: string };

/** Fetch one page of a chat's messages.
 * @param options - the host (for its token), the percent-encoded chat id, the page
 * @returns the page envelope, or the error message to show in the list
 */
async function fetchMessagesPage(
  options: { host: ChatHost; chatId: string; page: number },
): Promise<PageFetch> {
  const { host, chatId, page, } = options;
  const url = `${API_BASE}/api/v1/chats/${chatId}/messages?page=${page}&pageSize=${PAGE_SIZE}`;
  const result = await _fetch<MessagesPage>(url, {
    auth: host.sessionToken ? { sessionToken: host.sessionToken, } : undefined,
    handle401: false,
  },);

  if (!result.ok) {
    return {
      ok: false,
      message: result.status !== undefined
        ? `Failed to load messages (HTTP ${result.status})`
        : `Network error loading messages: ${result.error.message}`,
    };
  }

  return { ok: true, page: result.data, };
}

/**
 * Load the chat's newest messages into the list.
 *
 * The endpoint pages by `page`/`pageSize` and answers `jsonPaginated`, which
 * nests its metadata under `pagination` (src/routes/http-utils/responses.ts);
 * there is no cursor. Rows come back oldest-first, so page 1 is the START of the
 * chat — reading only that page would show the opening turns forever. The first
 * read therefore learns `totalPages`, and a chat longer than one page is re-read
 * at its last page. Two requests, and only for the long ones.
 * @param host
 * @returns {Promise<void>}
 */
export async function loadMessages(host: ChatHost,): Promise<void> {
  if (!host.chatId) { return; }
  const chatId = encodeURIComponent(host.chatId,);
  try {
    const first = await fetchMessagesPage({ host, chatId, page: 1, },);
    if (!first.ok) {
      host.showError(first.message,);
      return;
    }

    const totalPages = first.page.pagination?.totalPages ?? 1;
    if (totalPages <= 1) {
      host.setMessages(first.page.data ?? [],);
      return;
    }

    const last = await fetchMessagesPage({ host, chatId, page: totalPages, },);
    if (!last.ok) {
      host.showError(last.message,);
      return;
    }

    host.setMessages(last.page.data ?? [],);
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
