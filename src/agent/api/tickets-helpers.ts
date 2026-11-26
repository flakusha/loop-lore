// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure auth, ownership and validation helpers for the agent ticket lifecycle.
 * Route registration lives in `tickets.ts`; this module holds the reusable
 * guards, audit write and markdown transforms those routes call into.
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { extractBearerToken, } from "../../middleware/auth/token";
import { safeJsonStringify, } from "../../utils";
import { NO_AGENT_TOKEN_DIGEST, recordAgentAction, } from "../audit";
import { hashAgentToken, type ResolvedAgentToken, } from "./auth";

/** Safe ticket slug: no separators, no traversal, bounded length. */
export const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/** Agent-action labels for the three lifecycle operations. */
export const OPEN_ACTION = "tickets_open";
export const CLOSE_ACTION = "tickets_close";
export const COMMENT_ACTION = "tickets_comment";

const STATUS_PATTERNS = [/^\*\*Status:\*\*\s*(.+)$/im, /^\*\*Status\*\*:\s*(.+)$/im,];
const DEPENDENCY_PATTERNS = [
  /^\*\*(?:Depends on|Blockers|Blocked by):\*\*\s*(.+)$/im,
  /^\*\*(?:Depends on|Blockers|Blocked by)\*\*:\s*(.+)$/im,
];

/** The bearer digest of the request, never the plaintext (auth guard contract). */
function digestOf(request: Request,): string {
  const raw = extractBearerToken(request,);
  return raw ? hashAgentToken(raw,).slice(0, 16,) : NO_AGENT_TOKEN_DIGEST;
}

/** One explicit audit row carrying the ticket id and the owning token id. */
export async function auditTicketAction(
  database: Kysely<DB>,
  request: Request,
  action: string,
  token: ResolvedAgentToken,
  slug: string,
  result: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const meta = safeJsonStringify({ ticketId: slug, tokenId: token.id, ...extra, },);
  await recordAgentAction(database, {
    tokenDigest: digestOf(request,),
    action,
    result,
    metadata: meta.ok ? meta.value : "{}",
  },);
}

/** True when this token has a successful open audit row for the ticket. */
export async function filedBy(
  database: Kysely<DB>,
  slug: string,
  tokenId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("agent_actions",)
    .select("id",)
    .where("action", "=", OPEN_ACTION,)
    .where("result", "=", "success",)
    .where(sql<string>`json_extract(metadata, '$.ticketId')`, "=", slug,)
    .where(sql<string>`json_extract(metadata, '$.tokenId')`, "=", tokenId,)
    .limit(1,)
    .executeTakeFirst();

  return row !== undefined;
}

/** Status value from either ticket-header convention, or null. */
export function readStatus(markdown: string,): string | null {
  for (const pattern of STATUS_PATTERNS) {
    const match = pattern.exec(markdown,);
    if (match?.[1]) { return match[1].trim(); }
  }

  return null;
}

/** A dependency field with a real value counts as an open blocker. */
export function hasOpenBlockers(markdown: string,): boolean {
  for (const pattern of DEPENDENCY_PATTERNS) {
    const match = pattern.exec(markdown,);
    if (!match?.[1]) { continue; }
    const value = match[1].trim();
    return value !== "" && !/^(none|n\/a|na|[-—]|done|closed)\b/i.test(value,);
  }

  return false;
}

/** Accept a commit SHA, `#123`, `PR #123`, or a pull/commit URL. */
export function hasLinkedReference(reference: string,): boolean {
  const value = reference.trim();
  return /^[0-9a-f]{7,40}$/i.test(value,) ||
    /^#\d+$/.test(value,) ||
    /^(?:pr|commit)\s+#?\d+$/i.test(value,) ||
    /^https?:\/\/\S+\/(?:pull|commit)\/\S+$/i.test(value,);
}

/** Flip Status to Done and append the resolution block. */
export function closeMarkdown(
  markdown: string,
  resolution: string,
  reference: string,
  tokenId: string,
): string {
  const stamped = STATUS_PATTERNS.some((re,) => re.test(markdown,))
    ? markdown
      .replace(/^\*\*Status:\*\*\s*.+$/im, "**Status:** Done",)
      .replace(/^\*\*Status\*\*:\s*.+$/im, "**Status**: Done",)
    : markdown;

  return `${stamped.trimEnd()}\n\n**Resolution**\n\n${resolution.trim()}\n\n**Linked reference:** ${reference.trim()}\n\nClosed by agent token ${tokenId}.\n`;
}
