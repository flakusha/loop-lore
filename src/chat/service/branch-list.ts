// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cursor-paginated branch list (FEAT-046).
 *
 * Keyset pagination on `(created_at, id)` rather than OFFSET so a deep page
 * stays O(limit) and rows inserted mid-walk cannot shift or duplicate a page
 * boundary. The cursor is opaque base64url(JSON), matching the memory-audit
 * route's convention; clients round-trip it without parsing.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
// Narrow module, not the `safe-buffer` barrel: the barrel re-exports
// `compression.ts`, which pulls `node:zlib` into the browser build.
import { safeFromBase64Url, } from "../../utils/safe-buffer/base64";
import { checkChatAccess, } from "./access";
import { withMeta, } from "./branch-helpers";
import type { ChatBranchWithMeta, } from "./branches";
import type { ServiceError, } from "./types";

/** Result type for `listBranchesPage`. */
export type ListBranchesPageResult =
  | { ok: true; branches: ChatBranchWithMeta[]; nextCursor: string | null }
  | ServiceError;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Decoded-cursor byte cap. A real cursor is two short strings (an ISO stamp
 * and a UUID), so anything near this ceiling is hostile input; reject it
 * before the JSON parse rather than after.
 */
const MAX_CURSOR_BYTES = 512;

/** Keyset position a cursor encodes. */
export interface BranchCursor {
  createdAt: string;
  id: string;
}

/**
 * Encode a keyset position for round-tripping as `?cursor=`.
 * @param cursor
 * @returns {string} base64url JSON; `""` when serialization fails.
 */
export function encodeBranchCursor(cursor: BranchCursor,): string {
  const encoded = safeJsonStringify(cursor,);
  return encoded.ok
    ? Buffer.from(encoded.value, "utf8",).toString("base64url",)
    : "";
}

/**
 * Decode `?cursor=`; a corrupt cursor degrades to "first page".
 *
 * `Buffer.from(raw, "base64url")` silently skips characters outside the
 * alphabet, so a cursor with junk wrapped around a valid payload decodes to
 * that payload and the caller resumes mid-list from a boundary the server
 * never issued. `safeFromBase64Url` rejects instead.
 * @param raw
 * @returns {BranchCursor | null} null when absent, oversized, or unparseable.
 */
function decodeBranchCursor(raw: string | undefined,): BranchCursor | null {
  if (!raw) { return null; }
  const bytes = safeFromBase64Url(raw, MAX_CURSOR_BYTES,);
  if (!bytes.ok) { return null; }
  const decoded = safeJsonParse<{ createdAt?: unknown; id?: unknown }>(
    bytes.buffer.toString("utf8",),
  );

  if (!decoded.ok) { return null; }
  const { createdAt, id, } = decoded.value;
  if (typeof createdAt !== "string" || typeof id !== "string") { return null; }
  return { createdAt, id, };
}

/** Parameters for `listBranchesPage`. */
export interface ListBranchesPageParams {
  chatId: string;
  actorId: string;
  /** Page size; clamped to `MAX_PAGE_SIZE`. Defaults to 20. */
  limit?: number;
  /** Opaque `nextCursor` from a previous page. */
  cursor?: string;
}

/**
 * One page of branches for a chat. `nextCursor` is null on the last page.
 * @param db
 * @param params
 * @returns {Promise<ListBranchesPageResult>}
 */
export async function listBranchesPage(
  db: Kysely<DB>,
  params: ListBranchesPageParams,
): Promise<ListBranchesPageResult> {
  const { chatId, actorId, } = params;
  const access = await checkChatAccess(db, chatId, actorId, null,);
  if (!access.ok) { return access.error; }

  const requested = Number(params.limit,);
  const pageSize = Number.isFinite(requested,) && requested > 0
    ? Math.min(Math.trunc(requested,), MAX_PAGE_SIZE,)
    : DEFAULT_PAGE_SIZE;

  let query = db.selectFrom("chat_branches",).selectAll().where("chat_id", "=", chatId,);
  const cursor = decodeBranchCursor(params.cursor,);
  if (cursor) {
    query = query.where((eb,) =>
      eb.or([
        eb("created_at", ">", cursor.createdAt,),
        eb.and([eb("created_at", "=", cursor.createdAt,), eb("id", ">", cursor.id,),],),
      ],)
    );
  }

  // One extra row tells us whether another page exists, without a COUNT.
  const rows = await query
    .orderBy("created_at", "asc",)
    .orderBy("id", "asc",)
    .limit(pageSize + 1,)
    .execute();

  const page = rows.slice(0, pageSize,);
  const last = page.at(-1,);
  const branches: ChatBranchWithMeta[] = [];
  for (const row of page) { branches.push(await withMeta(db, chatId, row,),); }
  return {
    ok: true,
    branches,
    nextCursor: rows.length > pageSize && last
      ? encodeBranchCursor({ createdAt: last.created_at, id: last.id, },)
      : null,
  };
}
