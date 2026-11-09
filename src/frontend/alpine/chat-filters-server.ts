// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Server-side persistence for the chat-list filter panel
 * (TASK-server-side-room-filter-enforcement).
 *
 * Until this module the panel state lived only in localStorage
 * (`chat-sidebar-filters`), so filters were lost on a wiped browser and never
 * applied cross-device. The server now keeps one snapshot per user
 * (`chat_list_filters`, migration 098):
 *
 * - `saveChatFilters` PUTs the full snapshot; the list endpoint then enforces
 *   the saved filters server-side for every dimension a request omits.
 * - `reconcileChatFiltersFromServer` GETs the snapshot and applies it onto
 *   the component state, so a fresh browser converges on the saved panel.
 *
 * Everything is best-effort and fire-and-forget: callers never await these
 * helpers, every failure resolves to `null`/`false`/silent no-op, and the
 * localStorage mirror in chat-filters.ts stays the offline fallback — an
 * offline or logged-out client behaves exactly as before. The fetcher is
 * injectable (defaults to `apiFetch`) so tests need no network or module
 * mocking.
 */
import { safeJsonParse, safeJsonStringify, } from "../../utils";
import { apiFetch, } from "./htmx";

export type ChatFilterSort = "recent" | "name" | "unread" | "pinned-first";

/** GET/PUT payload of `/api/v1/chats/filters` (mirrors `ChatListFiltersBody`). */
export interface ChatFilterSnapshot {
  type: "all" | "direct" | "group";
  status: "all" | "active" | "archived";
  sort: ChatFilterSort;
  /** World uuid the list is narrowed to; null = no world filter. */
  world: string | null;
  minMessages: number | null;
  maxMessages: number | null;
  updatedSince: string | null;
}

/** The seven filter fields the chat-filters.ts component owns ("" = cleared). */
export interface ChatFilterFields {
  _chatType: string;
  _chatStatus: string;
  _chatSort: string;
  _chatWorld: string;
  _chatMinMessages: string;
  _chatMaxMessages: string;
  _chatUpdatedSince: string;
}

/** Minimal request surface so tests inject a stub instead of mocking htmx. */
export type ChatFilterFetcher = (url: string, init?: RequestInit,) => Promise<Response>;

const FILTERS_URL = "/api/v1/chats/filters";

/** Non-negative integer from a panel string, or null when unset/garbage. */
function parseNonNegativeInt(raw: string,): number | null {
  if (!raw) { return null; }
  const parsed = Number(raw,);
  return Number.isFinite(parsed,) && parsed >= 0 ? Math.trunc(parsed,) : null;
}

/**
 * Component filter fields → the server snapshot shape.
 * @param fields
 * @returns a full snapshot (every key present; cleared values are "all"/null)
 */
export function toChatFilterSnapshot(fields: ChatFilterFields,): ChatFilterSnapshot {
  return {
    type: fields._chatType === "direct" || fields._chatType === "group" ? fields._chatType : "all",
    status: fields._chatStatus === "active" || fields._chatStatus === "archived"
      ? fields._chatStatus
      : "all",
    sort: fields._chatSort === "name" || fields._chatSort === "unread" ||
        fields._chatSort === "pinned-first"
      ? fields._chatSort
      : "recent",
    world: fields._chatWorld || null,
    minMessages: parseNonNegativeInt(fields._chatMinMessages,),
    maxMessages: parseNonNegativeInt(fields._chatMaxMessages,),
    updatedSince: fields._chatUpdatedSince || null,
  };
}

/** Server snapshot → component filter fields (null/"all" clear back to defaults). */
export function applyChatFilterSnapshot(state: ChatFilterFields, snapshot: ChatFilterSnapshot,): void {
  state._chatType = snapshot.type;
  state._chatStatus = snapshot.status;
  state._chatSort = snapshot.sort;
  state._chatWorld = snapshot.world ?? "";
  state._chatMinMessages = snapshot.minMessages === null ? "" : String(snapshot.minMessages,);
  state._chatMaxMessages = snapshot.maxMessages === null ? "" : String(snapshot.maxMessages,);
  state._chatUpdatedSince = snapshot.updatedSince ?? "";
}

/**
 * GET the caller's saved snapshot from the server.
 * @param fetcher
 * @returns the snapshot, or null on any failure (offline, 401, malformed body)
 */
export async function fetchChatFilters(
  fetcher: ChatFilterFetcher = apiFetch,
): Promise<ChatFilterSnapshot | null> {
  try {
    const res = await fetcher(FILTERS_URL,);
    if (!res.ok) { return null; }

    const parsed = safeJsonParse<{ data?: Partial<ChatFilterSnapshot> }>(await res.text(),);
    if (!parsed.ok || typeof parsed.value.data !== "object" || parsed.value.data === null) {
      return null;
    }

    // Tolerant field narrowing: the endpoint is validated server-side, but a
    // stale proxy or a schema drift must never crash the panel.
    const d = parsed.value.data;
    return {
      type: d.type === "direct" || d.type === "group" ? d.type : "all",
      status: d.status === "active" || d.status === "archived" ? d.status : "all",
      sort: d.sort === "name" || d.sort === "unread" || d.sort === "pinned-first" ? d.sort : "recent",
      world: typeof d.world === "string" && d.world ? d.world : null,
      minMessages: typeof d.minMessages === "number" && d.minMessages >= 0 ? d.minMessages : null,
      maxMessages: typeof d.maxMessages === "number" && d.maxMessages >= 0 ? d.maxMessages : null,
      updatedSince: typeof d.updatedSince === "string" && d.updatedSince ? d.updatedSince : null,
    };
  } catch {
    return null;
  }
}

/**
 * PUT the full snapshot as the caller's saved server-side filters.
 * @param snapshot
 * @param fetcher
 * @returns true when the server accepted the snapshot, false otherwise
 */
export async function saveChatFilters(
  snapshot: ChatFilterSnapshot,
  fetcher: ChatFilterFetcher = apiFetch,
): Promise<boolean> {
  const encoded = safeJsonStringify(snapshot,);
  if (!encoded.ok) { return false; }

  try {
    const res = await fetcher(FILTERS_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: encoded.value,
    },);

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * One-shot server reconcile: fetch the saved snapshot and apply it onto the
 * component state. Fire-and-forget — the panel paints from localStorage
 * first, then converges on the durable server values.
 * @param state
 */
export async function reconcileChatFiltersFromServer(state: ChatFilterFields,): Promise<void> {
  const snapshot = await fetchChatFilters();
  if (snapshot) { applyChatFilterSnapshot(state, snapshot,); }
}
