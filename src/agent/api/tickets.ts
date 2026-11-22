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
import { existsSync, mkdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { AgentTokenScope, } from "../../db/enums";
import { lintBriefing, } from "../../plan/briefing-linter";
import { HttpStatus, jsonError, jsonResponse, } from "../../routes/http-utils";
import { requireAgentScope, type ResolvedAgentToken, } from "./auth";
import {
  auditTicketAction,
  CLOSE_ACTION,
  closeMarkdown,
  COMMENT_ACTION,
  filedBy,
  hasLinkedReference,
  hasOpenBlockers,
  OPEN_ACTION,
  readStatus,
  SLUG_RE,
} from "./tickets-helpers";
import type { AgentRouteOpts, } from "./types";

/** A briefing must reach this score before it may be filed. */
export const MIN_TICKET_SCORE = 3;

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
