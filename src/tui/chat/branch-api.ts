// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI callers for the shipped chat-branch / party-split routes.
 *
 * Every payload here is transcribed from the route validators, not guessed:
 * `src/routes/chats/branches.ts` (fork body `{ messageId, name? }`, list query
 * `limit`/`cursor`), `branch-crud.ts` (merge body `{ intoBranchId? }`) and
 * `split.ts` (split `{ branches: [{ name?, locationId, actorIds }] }`,
 * reunite `{ secondaryChatId }`). No new backend endpoint is involved.
 */
import { safeFetch as _realFetch, } from "../../utils";
import { API_BASE, } from "./api";

/** One branch row as returned by the keyset-paginated list route. */
export interface BranchRow {
  id: string;
  name: string;
  isActive: boolean;
  messageCount: number;
  lastActivity: string | null;
}

/** Envelope payload of GET /api/v1/chats/:id/branches. */
export interface BranchListData {
  branches: BranchRow[];
  nextCursor: string | null;
}

/** Payload of the fork route. */
export interface ForkData {
  branch: { id: string; name: string };
  messagePath: string[];
}

/** Payload of the branch merge route. */
export interface MergeData {
  sourceBranchId: string;
  targetBranchId: string;
  movedMessageIds: string[];
}

/** One chat produced by POST /api/v1/chats/:id/split. */
export interface SplitRow {
  chatId: string;
  locationId: string;
  participantCount: number;
}

/** Payload of the split route. */
export interface SplitData {
  branches: SplitRow[];
  splitNarration: string;
}

/** Payload of the reunite route. */
export interface ReuniteData {
  mergedMessageCount: number;
  reunionNarration: string;
}

/** Result of any branch command. */
export type BranchResult<T,> = { ok: true; data: T } | { ok: false; error: string };

let _fetch = _realFetch;

/** Swap the HTTP client (tests only). */
export function setFetch(fn: typeof _realFetch,): void {
  _fetch = fn;
}

/** One authenticated JSON call; all five verbs answer `{ data }` on success. */
async function call<T,>(
  path: string,
  sessionToken: string | undefined,
  init: { method?: string; body?: unknown } = {},
): Promise<BranchResult<T>> {
  try {
    const result = await _fetch<{ data: T }>(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      auth: sessionToken ? { sessionToken, } : undefined,
      body: init.body,
      handle401: false,
    },);

    if (!result.ok) {
      return { ok: false, error: result.status !== undefined ? `HTTP ${result.status}` : result.error.message, };
    }

    return { ok: true, data: result.data.data, };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }
}

/** List a chat's branches, optionally from a previous `nextCursor`. */
export function listBranches(options: {
  chatId: string;
  sessionToken?: string;
  limit?: number;
  cursor?: string;
},): Promise<BranchResult<BranchListData>> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) { query.set("limit", String(options.limit,),); }
  if (options.cursor !== undefined) { query.set("cursor", options.cursor,); }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return call<BranchListData>(
    `/api/v1/chats/${encodeURIComponent(options.chatId,)}/branches${suffix}`,
    options.sessionToken,
  );
}

/** Create (fork) a branch at a message. `name` is omitted when not supplied. */
export function createBranch(options: {
  chatId: string;
  messageId: string;
  name?: string;
  sessionToken?: string;
},): Promise<BranchResult<ForkData>> {
  const body: { messageId: string; name?: string } = { messageId: options.messageId, };
  if (options.name !== undefined) { body.name = options.name; }
  return call<ForkData>(
    `/api/v1/chats/${encodeURIComponent(options.chatId,)}/branches`,
    options.sessionToken,
    { method: "POST", body, },
  );
}

/** Merge a branch. A bare `{}` body means "into the active branch". */
export function mergeBranch(options: {
  chatId: string;
  branchId: string;
  intoBranchId?: string;
  sessionToken?: string;
},): Promise<BranchResult<MergeData>> {
  const chat = encodeURIComponent(options.chatId,);
  const branch = encodeURIComponent(options.branchId,);
  const body: { intoBranchId?: string } = {};
  if (options.intoBranchId !== undefined) { body.intoBranchId = options.intoBranchId; }
  return call<MergeData>(
    `/api/v1/chats/${chat}/branches/${branch}/merge`,
    options.sessionToken,
    { method: "POST", body, },
  );
}

/** Split the active chat into one chat per branch descriptor. */
export function splitChat(options: {
  chatId: string;
  branches: { name?: string; locationId: string; actorIds: string[] }[];
  sessionToken?: string;
},): Promise<BranchResult<SplitData>> {
  return call<SplitData>(
    `/api/v1/chats/${encodeURIComponent(options.chatId,)}/split`,
    options.sessionToken,
    { method: "POST", body: { branches: options.branches, }, },
  );
}

/** Reunite a secondary chat into the active (primary) chat. */
export function reuniteChats(options: {
  chatId: string;
  secondaryChatId: string;
  sessionToken?: string;
},): Promise<BranchResult<ReuniteData>> {
  return call<ReuniteData>(
    `/api/v1/chats/${encodeURIComponent(options.chatId,)}/reunite`,
    options.sessionToken,
    { method: "POST", body: { secondaryChatId: options.secondaryChatId, }, },
  );
}
