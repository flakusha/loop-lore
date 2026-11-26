// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI callers + commands for the shipped group-chat surface: the read-only
 * group view (turn order + roster), participant switching (impersonation)
 * and `@name` resolution. Every call maps to an existing /api/v1 route and
 * the mention vocabulary comes from the shipped pure parser under
 * `src/group-chat/` — no engine code, no new backend surface.
 */
import { resolveMention, } from "../../group-chat/mention-parser";
import { safeFetch as _realFetch, } from "../../utils";
import { API_BASE, type CommandDescriptor, } from "./api";
import type { ChatHost, } from "./types";

/** Client-only commands this module adds to the completion/help strip. */
export const GROUP_COMMANDS: CommandDescriptor[] = [
  { name: "group", descriptionKey: "commands.group", },
  { name: "participants", descriptionKey: "commands.participants", },
  { name: "impersonate", descriptionKey: "commands.impersonate", },
  { name: "mention", descriptionKey: "commands.mention", },
];

/** One row of GET /api/v1/chats/:id/participants (fields read here). */
export interface ParticipantRow {
  actor_id: string;
  display_name: string;
  role_in_chat: string;
  impersonate_actor_id?: string | null;
}

/** One slot in the read-only turn-order view. */
export interface TurnOrderSlot {
  actor_id: string;
  display_name: string;
  isCurrent: boolean;
  isNext: boolean;
}

/** Payload of GET /api/v1/chats/:id/turn-order (narrowed to what we render). */
export interface GroupTurnOrderView {
  strategy: string | null;
  currentActorId: string | null;
  nextActorId: string | null;
  order: TurnOrderSlot[];
}

/** Result of one group-chat API call. */
export type GroupResult<T,> = { ok: true; data: T } | { ok: false; error: string };

let _fetch = _realFetch;

/** Swap the HTTP client (tests only) — mirrors `chat/api.ts setFetch`. */
export function setFetch(fn: typeof _realFetch,): void {
  _fetch = fn;
}

/** @returns the payload from either `{ data }` or a bare response body. */
function unwrap<T,>(body: unknown,): T {
  return body !== null && typeof body === "object" && !Array.isArray(body,) && "data" in body
    ? (body as { data: T }).data
    : body as T;
}

/** One authenticated JSON call; some routes wrap the payload in `{ data }`. */
async function call<T,>(
  path: string,
  sessionToken: string | undefined,
  init: { method?: string; body?: unknown } = {},
): Promise<GroupResult<T>> {
  try {
    const result = await _fetch<unknown>(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      auth: sessionToken ? { sessionToken, } : undefined,
      body: init.body,
      handle401: false,
    },);

    if (!result.ok) {
      return { ok: false, error: result.status !== undefined ? `HTTP ${result.status}` : result.error.message, };
    }

    return { ok: true, data: unwrap<T>(result.data,), };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }
}

/** @returns the chat's participants in the server's display order. */
export function listParticipants(
  chatId: string,
  sessionToken: string | undefined,
): Promise<GroupResult<ParticipantRow[]>> {
  return call(`/api/v1/chats/${encodeURIComponent(chatId,)}/participants`, sessionToken,);
}

/** @returns the read-only turn-order snapshot (never mutates turn state). */
export function loadTurnOrder(
  chatId: string,
  sessionToken: string | undefined,
): Promise<GroupResult<{ turnOrder: GroupTurnOrderView | null }>> {
  return call(`/api/v1/chats/${encodeURIComponent(chatId,)}/turn-order`, sessionToken,);
}

/**
 * Switch the caller's active participant; `null` clears impersonation.
 * Server-gated on chat owner / `admin.chat`.
 */
export function setImpersonation(
  chatId: string,
  actorId: string | null,
  sessionToken: string | undefined,
): Promise<GroupResult<{ ok: true }>> {
  return call(`/api/v1/chats/${encodeURIComponent(chatId,)}/impersonate`, sessionToken, {
    method: "PUT",
    body: { impersonateActorId: actorId, },
  },);
}

/** Render the group view: strategy, current/next speaker and roster. */
function formatGroup(people: ParticipantRow[], order: GroupTurnOrderView | null,): string {
  if (order === null) {
    return people.length === 0
      ? "Group: no participants."
      : `Group: ${people.map((p,) => p.display_name).join(", ",)}`;
  }

  const current = order.order.find((slot,) => slot.isCurrent)?.display_name ?? "(none)";
  const next = order.order.find((slot,) => slot.isNext)?.display_name ?? "(none)";
  const slots = order.order.map((slot,) =>
    `${slot.isCurrent ? "*" : slot.isNext ? ">" : " "} ${slot.display_name} (${slot.actor_id})`
  );

  return [`Group — ${order.strategy ?? "default"} | now: ${current} | next: ${next}`, ...slots,].join("\n",);
}

/**
 * Dispatch `/group`, `/participants`, `/impersonate` and `/mention`.
 * @param host - chat widget host (chat id, token, transcript sinks)
 * @param text - trimmed input starting with `/`
 * @returns true when the text was one of these commands
 */
export async function dispatchGroupCommand(host: ChatHost, text: string,): Promise<boolean> {
  const [name, ...args] = text.split(/\s+/,);
  if (
    name !== "/group" && name !== "/participants" &&
    name !== "/impersonate" && name !== "/mention"
  ) {
    return false;
  }

  if (!host.chatId) {
    host.showError("No active chat. Create or select a chat first.",);
    return true;
  }

  const chatId = host.chatId;
  if (name === "/impersonate") {
    const token = args[0] ?? "";
    if (token === "" || token === "off" || token === "none" || token === "clear") {
      const cleared = await setImpersonation(chatId, null, host.sessionToken,);
      if (!cleared.ok) {
        host.showError(cleared.error,);
        return true;
      }

      host.addMessage({ id: crypto.randomUUID(), role: "system", content: "Impersonation cleared.", },);
      return true;
    }

    const people = await listParticipants(chatId, host.sessionToken,);
    if (!people.ok) {
      host.showError(people.error,);
      return true;
    }

    // A number selects the nth row of the same listing (1-based, as /chars).
    const index = /^\d+$/.test(token,) ? Number.parseInt(token, 10,) - 1 : -1;
    const target = index >= 0 ? people.data[index] : people.data.find((p,) => p.actor_id === token);
    if (!target) {
      host.showError("No such participant. Run /participants to list.",);
      return true;
    }

    const switched = await setImpersonation(chatId, target.actor_id, host.sessionToken,);
    if (!switched.ok) {
      host.showError(switched.error,);
      return true;
    }

    host.addMessage({
      id: crypto.randomUUID(),
      role: "system",
      content: `Speaking as ${target.display_name} (${target.actor_id}).`,
    },);

    return true;
  }

  const people = await listParticipants(chatId, host.sessionToken,);
  if (!people.ok) {
    host.showError(people.error,);
    return true;
  }

  if (name === "/mention") {
    const query = args.join(" ",).replace(/^@/, "",);
    if (query === "") {
      host.showError("Usage: /mention <name> — resolve a participant for @name.",);
      return true;
    }

    const roster = people.data.map((p,) => ({ actorId: p.actor_id, displayName: p.display_name, }));
    const actorId = resolveMention(query, roster,);
    host.addMessage({
      id: crypto.randomUUID(),
      role: "system",
      content: actorId === null
        ? `No participant named "${query}". Run /participants to list.`
        : `@${query} → ${actorId} — type @${query} in a message to address them.`,
    },);

    return true;
  }

  if (name === "/participants") {
    const rows = people.data.map((p, index,) => `${index + 1}. ${p.display_name} (${p.actor_id}) — ${p.role_in_chat}`);
    host.addMessage({
      id: crypto.randomUUID(),
      role: "system",
      content: rows.length > 0
        ? `Participants:\n${rows.join("\n",)}\n/impersonate <n|actorId|off> to switch; @name to mention.`
        : "No participants in this chat.",
    },);

    return true;
  }

  const order = await loadTurnOrder(chatId, host.sessionToken,);
  if (!order.ok) {
    host.showError(order.error,);
    return true;
  }

  host.addMessage({
    id: crypto.randomUUID(),
    role: "system",
    content: formatGroup(people.data, order.data.turnOrder,),
  },);

  return true;
}
