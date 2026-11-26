// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI callers for the shipped character (actor) list and chat-create routes.
 *
 * `src/routes/characters/list.ts` mounts `GET /api/v1/actors` (not
 * `/characters`) and filters with `?type=character`. `ChatCreateBody` accepts
 * `participantIds`, which is how a selected character joins a new chat.
 */
import { safeFetch as _realFetch, } from "../../utils";
import { createChat, } from "../chat-create-api";
import { API_BASE, } from "./api";

/** One actor row, narrowed to what the TUI lists and selects. */
export interface CharacterRow {
  id: string;
  display_name: string;
  description?: string | null;
}

/** Envelope of GET /api/v1/actors. */
export interface CharacterListData {
  data: CharacterRow[];
  pagination?: { total?: number; page?: number; pageSize?: number; totalPages?: number };
}

export type CharacterResult<T,> = { ok: true; data: T } | { ok: false; error: string };

let _fetch = _realFetch;

/** Swap the HTTP client (tests only). */
export function setFetch(fn: typeof _realFetch,): void {
  _fetch = fn;
}

/**
 * List characters. The actor route's `type` value is the ActorType enum member
 * `character` (validation/db-schemas.ts); page/pageSize default server-side.
 */
export async function listCharacters(options: {
  sessionToken?: string;
  page?: number;
  pageSize?: number;
},): Promise<CharacterResult<CharacterListData>> {
  const query = new URLSearchParams({ type: "character", },);
  if (options.page !== undefined) { query.set("page", String(options.page,),); }
  if (options.pageSize !== undefined) { query.set("pageSize", String(options.pageSize,),); }

  try {
    const result = await _fetch<CharacterListData>(`${API_BASE}/api/v1/actors?${query.toString()}`, {
      auth: options.sessionToken ? { sessionToken: options.sessionToken, } : undefined,
      handle401: false,
    },);

    if (!result.ok) {
      return { ok: false, error: result.status !== undefined ? `HTTP ${result.status}` : result.error.message, };
    }

    return { ok: true, data: result.data, };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }
}

/** Create a chat seeded with the selected character as a participant. */
export async function createChatWithCharacter(options: {
  name: string;
  actorId: string;
  sessionToken?: string;
},): Promise<{ ok: true; chatId: string } | { ok: false; error: string }> {
  return createChat({
    name: options.name,
    participantIds: [options.actorId,],
    sessionToken: options.sessionToken,
  },);
}
