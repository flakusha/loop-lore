// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI callers + commands for the shipped moderation surfaces: hide / delete
 * a message through the existing message routes, and read the content-flag
 * queue through the existing NSFW moderation route. No backend changes.
 */
import { safeFetch as _realFetch, } from "../../utils";
import { API_BASE, type CommandDescriptor, } from "./api";
import type { ChatHost, } from "./types";

/** Client-only commands this module adds to the completion/help strip. */
export const MODERATION_COMMANDS: CommandDescriptor[] = [
  { name: "hide", descriptionKey: "commands.hide", },
  { name: "delete", descriptionKey: "commands.delete", },
  { name: "queue", descriptionKey: "commands.queue", },
];

/** One redacted queue row (fields rendered by `/queue`). */
export interface ModerationFlag {
  id: string;
  contentType: string;
  flagReason: string;
  status: string;
  createdAt: string;
}

/** Payload of GET /api/v1/nsfw/moderation/flags. */
export interface ModerationQueue {
  flags: ModerationFlag[];
  total: number;
}

/** Result of one moderation API call. */
export type ModerationResult<T,> = { ok: true; data: T } | { ok: false; error: string };

let _fetch = _realFetch;

/** Swap the HTTP client (tests only) — mirrors `chat/api.ts setFetch`. */
export function setFetch(fn: typeof _realFetch,): void {
  _fetch = fn;
}

/** One authenticated JSON call; every moderation route answers `{ data }`. */
async function call<T,>(
  path: string,
  sessionToken: string | undefined,
  init: { method?: string; body?: unknown; parseJson?: boolean } = {},
): Promise<ModerationResult<T>> {
  try {
    const result = await _fetch<{ data: T }>(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      auth: sessionToken ? { sessionToken, } : undefined,
      body: init.body,
      handle401: false,
      parseJson: init.parseJson,
    },);

    if (!result.ok) {
      return { ok: false, error: result.status !== undefined ? `HTTP ${result.status}` : result.error.message, };
    }

    return { ok: true, data: result.data.data, };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }
}

/**
 * Hide a message through PUT /messages/:id/visibility.
 * @param messageId - message to hide
 * @param reason - optional moderator reason stored as `hidden_reason`
 * @param sessionToken - bearer token; omit to run anonymous
 */
export function hideMessage(
  messageId: string,
  reason: string,
  sessionToken: string | undefined,
): Promise<ModerationResult<{ ok: true }>> {
  const body: { visibility: string; reason?: string } = { visibility: "hidden_by_moderator", };
  if (reason !== "") { body.reason = reason; }
  return call(`/api/v1/messages/${encodeURIComponent(messageId,)}/visibility`, sessionToken, {
    method: "PUT",
    body,
  },);
}

/**
 * Delete a message through DELETE /messages/:id (204, no body).
 * `parseJson: false` keeps safeFetch from treating the empty body as bad JSON.
 */
export function deleteMessage(
  messageId: string,
  sessionToken: string | undefined,
): Promise<ModerationResult<unknown>> {
  return call(`/api/v1/messages/${encodeURIComponent(messageId,)}`, sessionToken, {
    method: "DELETE",
    parseJson: false,
  },);
}

/** @returns a page of the moderation flag queue, newest status first. */
export function loadModerationQueue(
  status: string,
  sessionToken: string | undefined,
): Promise<ModerationResult<ModerationQueue>> {
  const query = `?status=${encodeURIComponent(status,)}&limit=20`;
  return call(`/api/v1/nsfw/moderation/flags${query}`, sessionToken,);
}

/**
 * Dispatch `/hide`, `/delete` and `/queue`.
 * @param host - chat widget host (token, transcript sinks)
 * @param text - trimmed input starting with `/`
 * @returns true when the text was one of these commands
 */
export async function dispatchModerationCommand(host: ChatHost, text: string,): Promise<boolean> {
  const [name, ...args] = text.split(/\s+/,);
  if (name !== "/hide" && name !== "/delete" && name !== "/queue") { return false; }

  if (name === "/queue") {
    const queue = await loadModerationQueue(args[0] ?? "pending", host.sessionToken,);
    if (!queue.ok) {
      host.showError(queue.error,);
      return true;
    }

    const rows = queue.data.flags.map((flag,) =>
      `${flag.id}  ${flag.contentType}  ${flag.flagReason}  ${flag.status}  ${flag.createdAt}`
    );

    host.addMessage({
      id: crypto.randomUUID(),
      role: "system",
      content: rows.length > 0
        ? `Moderation queue (${queue.data.total} total):\n${rows.join("\n",)}`
        : "Moderation queue is empty.",
    },);

    return true;
  }

  const messageId = args[0];
  if (!messageId) {
    host.showError(
      name === "/hide"
        ? "Usage: /hide <messageId> [reason] — hide a message."
        : "Usage: /delete <messageId> — delete a message.",
    );

    return true;
  }

  const result = name === "/hide"
    ? await hideMessage(messageId, args.slice(1,).join(" ",), host.sessionToken,)
    : await deleteMessage(messageId, host.sessionToken,);

  if (!result.ok) {
    host.showError(result.error,);
    return true;
  }

  host.addMessage({
    id: crypto.randomUUID(),
    role: "system",
    content: name === "/hide" ? `Message ${messageId} hidden.` : `Message ${messageId} deleted.`,
  },);

  return true;
}
