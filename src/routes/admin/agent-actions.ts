// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin read surface for the RSI agent-actions audit trail (RSI #9).
 *
 *   GET /api/admin/agent-actions?token=&action=&limit=
 *
 * Same admin triple as the agent-token CRUD (`requireUserId` +
 * `can("admin.system")`). `?token=` accepts either the raw bearer token or
 * its 16-char digest prefix; both resolve to the stored digest prefix, so no
 * plaintext is ever compared or returned. Rows are newest first and the page
 * size defaults to 50, capped at 200.
 */
import { Elysia, t, } from "elysia";
import { hashAgentToken, } from "../../agent/api/auth";
import { can, } from "../../users/permissions";
import { forbiddenResponse, jsonResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** Default and maximum page size for the audit listing. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const ListQuery = t.Object({
  token: t.Optional(t.String({ maxLength: 256, },),),
  action: t.Optional(t.String({ maxLength: 128, },),),
  limit: t.Optional(t.String({ maxLength: 8, },),),
},);

const NullableString = t.Union([t.String(), t.Null(),],);

const AgentActionRow = t.Object({
  id: t.Integer(),
  token_digest: t.String(),
  user_id: NullableString,
  action: t.String(),
  worktree_id: NullableString,
  commit_hash: NullableString,
  result: t.String(),
  duration_ms: t.Union([t.Integer(), t.Null(),],),
  metadata: NullableString,
  created_at: t.String(),
},);

/** Resolve a caller-supplied token or 16-char prefix to the stored digest. */
function tokenFilterDigest(token: string,): string {
  return /^[0-9a-f]{16}$/.test(token,) ? token : hashAgentToken(token,).slice(0, 16,);
}

/** @param opts - database/config threaded like every admin plugin
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the Elysia plugin */
export function agentActionsRoutes(opts: AdminRouteOpts, prefix = "/api",): Elysia {
  const db = opts.database;

  return new Elysia({ name: "admin-agent-actions", },).get(
    `${prefix}/admin/agent-actions`,
    async (ctx: any,) => {
      const adminId = requireUserId(ctx,);
      if (typeof adminId !== "string") { return adminId; }
      if (!can(ctx.userRole ?? null, "admin.system",)) { return forbiddenResponse(); }

      const query = ctx.query as { token?: string; action?: string; limit?: string };
      const parsed = Number.parseInt(query.limit ?? "", 10,);
      const limit = Number.isFinite(parsed,)
        ? Math.min(Math.max(parsed, 1,), MAX_LIMIT,)
        : DEFAULT_LIMIT;

      let selection = db.selectFrom("agent_actions",).selectAll();
      if (query.token) {
        selection = selection.where("token_digest", "=", tokenFilterDigest(query.token,),);
      }

      if (query.action) {
        selection = selection.where("action", "=", query.action,);
      }

      const data = await selection
        .orderBy("created_at", "desc",)
        .orderBy("id", "desc",)
        .limit(limit,)
        .execute();

      return jsonResponse({ data, },);
    },
    {
      query: ListQuery,
      response: t.Object({ data: t.Array(AgentActionRow,), },),
      detail: {
        summary: "List RSI agent API actions",
        description:
          "Read the agent-actions audit trail, newest first. `?token=` accepts a raw agent bearer token or its 16-char SHA-256 digest prefix; `?action=` filters the sub-route. `?limit` defaults to 50 and is capped at 200. Admin only; plaintext tokens are never returned.",
        tags: ["Admin", "Agent API",],
      },
    },
  );
}
