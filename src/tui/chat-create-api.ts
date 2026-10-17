// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI Chat Create - HTTP layer
 *
 * POST /api/v1/chats to create a new chat. Uses raw `fetch` rather than
 * `safeFetch` because safeFetch discards the error body for non-2xx responses
 * (src/utils/safe-fetch/fetch.ts:175-182), and the server's 403 messages from
 * the age-gate and NSFW-participant checks must be surfaced to the user.
 */

import { jsonParseOr, jsonStringifyOr, } from "../utils";
import { API_BASE, } from "./chat";

/** Result of a chat-create API call. */
export type ChatCreateResult =
  | { ok: true; chatId: string }
  | { ok: false; error: string };

/** Options for {@link createChat}. */
export interface CreateChatOptions {
  /** Chat name (1-255 chars, required by the server). */
  name: string;
  /** Bearer token; omit to run anonymous. */
  sessionToken?: string;
}

/**
 * Create a new chat via POST /api/v1/chats.
 *
 * Uses raw `fetch` to preserve the server's error body. safeFetch returns
 * `HTTP ${status}: ${statusText}` for non-2xx without reading the body
 * (src/utils/safe-fetch/fetch.ts:175-182), which would lose the age-gate and
 * NSFW-participant 403 messages.
 *
 * @param options - chat name and optional session token
 * @returns the new chat id, or an error message to render
 * @throws never — all errors are captured in the result union
 */
export async function createChat(options: CreateChatOptions,): Promise<ChatCreateResult> {
  const { name, sessionToken, } = options;

  let response: Response;
  try {
    // eslint-disable-next-line no-restricted-syntax -- raw Response: safeFetch drops the error body for non-2xx.
    response = await fetch(`${API_BASE}/api/v1/chats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}`, } : {}),
      },
      body: jsonStringifyOr({ name, },),
    },);
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }

  if (!response.ok) {
    // Read the error body before it's discarded. Errors carry
    // `{ error: message, code, meta }` (src/routes/http-utils/errors.ts:63),
    // which is where the age-gate and NSFW-participant 403 messages live.
    const text = await response.text();
    const message = jsonParseOr<{ error?: string }>(text, {},).error ?? `HTTP ${response.status}`;

    return { ok: false, error: message, };
  }

  // Success: 201 with { id, meta }
  const text = await response.text();
  const id = jsonParseOr<{ id?: string }>(text, {},).id;
  if (id) { return { ok: true, chatId: id, }; }

  return { ok: false, error: "Create succeeded but no chat id returned", };
}
