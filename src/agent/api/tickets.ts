// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RSI agent ticket lifecycle (RSI #18).
 *
 * `POST /api/v1/agent/tickets/open|close|comment`, all gated by the fifth
 * token tier `agent:tickets`. Open scores the submitted markdown with the
 * same BriefingScript core the CLI gate uses and writes ONLY a
 * `.plan/tickets/<slug>.md` file — never a git issue (the orphan-issue
 * regression). Close/comment are limited to the token that filed the ticket:
 * `agent_actions` (RSI #9) is the ownership record, with the ticket id and
 * token id carried in its `metadata` JSON. Every op writes its own audit row.
 */
import { Elysia, t, } from "elysia";
import { type Kysely, sql, } from "kysely";
import { existsSync, mkdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { AgentTokenScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { extractBearerToken, } from "../../middleware/auth/token";
import { lintBriefing, } from "../../plan/briefing-linter";
import { HttpStatus, jsonError, jsonResponse, } from "../../routes/http-utils";
import { safeJsonStringify, } from "../../utils";
import { NO_AGENT_TOKEN_DIGEST, recordAgentAction, } from "../audit";
import { hashAgentToken, requireAgentScope, type ResolvedAgentToken, } from "./auth";
import type { AgentRouteOpts, } from "./types";

/** Safe ticket slug: no separators, no traversal, bounded length. */
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/** A briefing must reach this score before it may be filed. */
export const MIN_TICKET_SCORE = 3;

/** Agent-action labels for the three lifecycle operations. */
const OPEN_ACTION = "tickets_open";
const CLOSE_ACTION = "tickets_close";
const COMMENT_ACTION = "tickets_comment";

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
async function auditTicketAction(
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
async function filedBy(
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
function readStatus(markdown: string,): string | null {
  for (const pattern of STATUS_PATTERNS) {
    const match = pattern.exec(markdown,);
    if (match?.[1]) { return match[1].trim(); }
  }

  return null;
}

/** A dependency field with a real value counts as an open blocker. */
function hasOpenBlockers(markdown: string,): boolean {
  for (const pattern of DEPENDENCY_PATTERNS) {
    const match = pattern.exec(markdown,);
    if (!match?.[1]) { continue; }
    const value = match[1].trim();
    return value !== "" && !/^(none|n\/a|na|[-—]|done|closed)\b/i.test(value,);
  }

  return false;
}

/** Accept a commit SHA, `#123`, `PR #123`, or a pull/commit URL. */
function hasLinkedReference(reference: string,): boolean {
  const value = reference.trim();
  return /^[0-9a-f]{7,40}$/i.test(value,) ||
    /^#\d+$/.test(value,) ||
    /^(?:pr|commit)\s+#?\d+$/i.test(value,) ||
    /^https?:\/\/\S+\/(?:pull|commit)\/\S+$/i.test(value,);
}

/** Flip Status to Done and append the resolution block. */
function closeMarkdown(
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

/**
 * Ticket lifecycle plugin.
 * @param opts - database, limiter seams and optional `ticketsDir`
 * @param prefix - mount prefix (`/api/v1` in production)
 * @returns Elysia plugin with the three scope-gated routes
 */
export function ticketRoutes(opts: AgentRouteOpts, prefix = "/api",): Elysia {
  const database = opts.database;
  const ticketsDir = resolve(opts.ticketsDir ?? join(opts.repoRoot ?? process.cwd(), ".plan/tickets",),);
  const guard = requireAgentScope(AgentTokenScope.Tickets, opts,);
  const pathFor = (slug: string,) => join(ticketsDir, `${slug}.md`,);

  return new Elysia({ name: "agent-tickets", },)
    .post(
      `${prefix}/agent/tickets/open`,
      async (ctx: any,) => {
        const { slug, markdown, } = ctx.body as { slug: string; markdown: string };
        const token = ctx.agentToken as ResolvedAgentToken;
        const path = pathFor(slug,);

        if (!SLUG_RE.test(slug,)) {
          await auditTicketAction(database, ctx.request, OPEN_ACTION, token, slug, "rejected", {
            reason: "invalid_slug",
          },);

          return jsonError({ message: "Invalid ticket slug", status: HttpStatus.BadRequest, },);
        }

        if (existsSync(path,)) {
          await auditTicketAction(database, ctx.request, OPEN_ACTION, token, slug, "rejected", {
            reason: "duplicate",
          },);

          return jsonError({ message: "Ticket already exists", status: HttpStatus.Conflict, },);
        }

        // scoreTicketFile (scripts/check-briefing.ts) wraps this pure scorer;
        // scoring the request body directly avoids a src -> scripts dependency
        // and writing an unvalidated file to disk.
        const lint = lintBriefing(markdown, {
          kind: slug.startsWith("BUG-",) ? "BUG" : undefined,
        },);

        if (lint.score < MIN_TICKET_SCORE) {
          await auditTicketAction(database, ctx.request, OPEN_ACTION, token, slug, "rejected", {
            reason: "low_score",
            score: lint.score,
          },);

          return jsonError({
            message: `Ticket briefing scored ${lint.score}/5 (${lint.verdict}): ${lint.suggestions.join("; ",)}`,
            status: HttpStatus.BadRequest,
            data: { score: lint.score, verdict: lint.verdict, suggestions: lint.suggestions, },
          },);
        }

        mkdirSync(ticketsDir, { recursive: true, },);
        writeFileSync(path, markdown.endsWith("\n",) ? markdown : `${markdown}\n`, "utf8",);
        await auditTicketAction(database, ctx.request, OPEN_ACTION, token, slug, "success", { score: lint.score, },);
        return jsonResponse({ data: { slug, path, score: lint.score, verdict: lint.verdict, }, }, HttpStatus.Created,);
      },
      {
        beforeHandle: [guard,],
        body: t.Object({ slug: t.String({ minLength: 1, },), markdown: t.String({ minLength: 1, },), },),
        detail: {
          summary: "File a validated .plan ticket",
          description:
            "Scores the markdown with the BriefingScript rubric and writes only .plan/tickets/<slug>.md. No git issue is created.",
          tags: ["Agent API",],
        },
      },
    )
    .post(
      `${prefix}/agent/tickets/close`,
      async (ctx: any,) => {
        const { slug, resolution, reference, } = ctx.body as { slug: string; resolution: string; reference: string };
        const token = ctx.agentToken as ResolvedAgentToken;
        const path = pathFor(slug,);

        if (!SLUG_RE.test(slug,)) {
          await auditTicketAction(database, ctx.request, CLOSE_ACTION, token, slug, "rejected", {
            reason: "invalid_slug",
          },);

          return jsonError({ message: "Invalid ticket slug", status: HttpStatus.BadRequest, },);
        }

        if (resolution.trim() === "") {
          await auditTicketAction(database, ctx.request, CLOSE_ACTION, token, slug, "rejected", {
            reason: "no_resolution",
          },);

          return jsonError({ message: "A resolution note is required", status: HttpStatus.BadRequest, },);
        }

        if (!hasLinkedReference(reference,)) {
          await auditTicketAction(database, ctx.request, CLOSE_ACTION, token, slug, "rejected", {
            reason: "no_reference",
          },);

          return jsonError({
            message: "A commit SHA, PR number or PR/commit URL is required",
            status: HttpStatus.BadRequest,
          },);
        }

        if (!(await filedBy(database, slug, token.id,))) {
          await auditTicketAction(database, ctx.request, CLOSE_ACTION, token, slug, "forbidden", {
            reason: "not_owner",
          },);

          return jsonError({ message: "Only the filing agent may close this ticket", status: HttpStatus.Forbidden, },);
        }

        if (!existsSync(path,)) {
          await auditTicketAction(database, ctx.request, CLOSE_ACTION, token, slug, "rejected", {
            reason: "missing",
          },);

          return jsonError({ message: "Ticket not found", status: HttpStatus.NotFound, },);
        }

        const markdown = readFileSync(path, "utf8",);
        const status = readStatus(markdown,);
        if (status !== null && /blocked/i.test(status,)) {
          await auditTicketAction(database, ctx.request, CLOSE_ACTION, token, slug, "rejected", {
            reason: "blocked",
          },);

          return jsonError({ message: "Blocked tickets cannot be closed", status: HttpStatus.Conflict, },);
        }

        if (hasOpenBlockers(markdown,)) {
          await auditTicketAction(database, ctx.request, CLOSE_ACTION, token, slug, "rejected", {
            reason: "open_blockers",
          },);

          return jsonError({ message: "Ticket has open blockers", status: HttpStatus.Conflict, },);
        }

        writeFileSync(path, closeMarkdown(markdown, resolution, reference, token.id,), "utf8",);
        await auditTicketAction(database, ctx.request, CLOSE_ACTION, token, slug, "success", {
          reference: reference.trim(),
        },);

        return jsonResponse({ data: { slug, status: "Done", reference: reference.trim(), }, },);
      },
      {
        beforeHandle: [guard,],
        body: t.Object({
          slug: t.String({ minLength: 1, },),
          resolution: t.String({ minLength: 1, },),
          reference: t.String({ minLength: 1, },),
        },),
        detail: {
          summary: "Close an own-filed ticket",
          description:
            "Requires a resolution note and a linked commit or PR; refuses blocked tickets and tickets with open blockers.",
          tags: ["Agent API",],
        },
      },
    )
    .post(
      `${prefix}/agent/tickets/comment`,
      async (ctx: any,) => {
        const { slug, body, } = ctx.body as { slug: string; body: string };
        const token = ctx.agentToken as ResolvedAgentToken;
        const path = pathFor(slug,);

        if (!SLUG_RE.test(slug,)) {
          await auditTicketAction(database, ctx.request, COMMENT_ACTION, token, slug, "rejected", {
            reason: "invalid_slug",
          },);

          return jsonError({ message: "Invalid ticket slug", status: HttpStatus.BadRequest, },);
        }

        if (body.trim() === "") {
          await auditTicketAction(database, ctx.request, COMMENT_ACTION, token, slug, "rejected", {
            reason: "empty_body",
          },);

          return jsonError({ message: "A non-empty comment body is required", status: HttpStatus.BadRequest, },);
        }

        if (!(await filedBy(database, slug, token.id,))) {
          await auditTicketAction(database, ctx.request, COMMENT_ACTION, token, slug, "forbidden", {
            reason: "not_owner",
          },);

          return jsonError({
            message: "Only the filing agent may comment on this ticket",
            status: HttpStatus.Forbidden,
          },);
        }

        if (!existsSync(path,)) {
          await auditTicketAction(database, ctx.request, COMMENT_ACTION, token, slug, "rejected", {
            reason: "missing",
          },);

          return jsonError({ message: "Ticket not found", status: HttpStatus.NotFound, },);
        }

        const markdown = readFileSync(path, "utf8",);
        const note = `${markdown.trimEnd()}\n\n**Agent comment (${
          new Date().toISOString()
        }, ${token.id})**\n\n${body.trim()}\n`;

        writeFileSync(path, note, "utf8",);
        await auditTicketAction(database, ctx.request, COMMENT_ACTION, token, slug, "success",);
        return jsonResponse({ data: { slug, commentLength: body.trim().length, }, },);
      },
      {
        beforeHandle: [guard,],
        body: t.Object({
          slug: t.String({ minLength: 1, },),
          body: t.String({ minLength: 1, },),
        },),
        detail: {
          summary: "Comment on an own-filed ticket",
          description: "Appends a timestamped comment to the ticket file; requires a non-empty body.",
          tags: ["Agent API",],
        },
      },
    );
}
