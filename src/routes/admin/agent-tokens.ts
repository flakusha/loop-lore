// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin CRUD for RSI agent tokens (TASK-recursive-self-improvement-agent-
 * api-router-and-token-scope-).
 *
 *   POST   /admin/agent-tokens        mint — raw token returned ONCE
 *   DELETE /admin/agent-tokens/:id    revoke (row-value revoked_at)
 *
 * Guard: the standard admin triple (`requireUserId` + `can("admin.system")`)
 * — same shape as integration-tokens. Rotation per ticket AC is revoke +
 * re-mint (never an in-place hash UPDATE). The mint response is the only
 * place the plaintext token exists; the table stores ONLY the SHA-256 hash.
 * Agent-token principals can never reach this surface (the auth chain
 * requires a user session; agent tokens only authorize `/api/v1/agent/*`).
 */
import { Elysia, t, } from "elysia";
import { mintAgentToken, } from "../../agent/api/auth";
import { AgentTokenScope, } from "../../db/enums";
import { logEntryEnvelope, } from "../../db/log-entries";
import { getChildLogger, } from "../../logger";
import { can, } from "../../users/permissions";
import { safeJsonStringify, } from "../../utils";
import { forbiddenResponse, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** TypeBox body for minting — scope tier union plus optional lifetime. */
const MintBody = t.Object({
  scope: t.Union([
    t.Literal("agent:worktree",),
    t.Literal("agent:check",),
    t.Literal("agent:commit",),
    t.Literal("agent:finalize",),
  ],),
  ttlMs: t.Optional(t.Number({ minimum: 1, },),),
},);

const TokenParams = t.Object({ id: t.String({ minLength: 1, },), },);

/** Best-effort audit row for mint/revoke (same sink as integration-tokens). */
async function auditTokenAction(
  database: AdminRouteOpts["database"],
  action: string,
  adminId: string,
  tokenId: string,
): Promise<void> {
  const meta = safeJsonStringify({ issuerAdminUserId: adminId, },);
  try {
    await database
      .insertInto("log_entries",)
      .values({
        ...logEntryEnvelope(6,),
        message: `admin agent-token ${action}`,
        module: "admin",
        event_type: "admin.agent_token",
        action,
        entity_type: "agent_token",
        entity_id: tokenId,
        user_id: adminId,
        meta: meta.ok ? meta.value : "{}",
      },)
      .execute();
  } catch (error) {
    getChildLogger("admin.agent-tokens",)?.error(
      "agent-token audit write failed",
      error instanceof Error ? error : undefined,
      { tokenId, },
    );
  }
}

/**
 * Agent-token admin CRUD plugin (mounts under the admin barrel).
 * @param opts - database/config threaded like every admin plugin
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the Elysia plugin
 */
export function agentTokenRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;

  return new Elysia({ name: "admin-agent-tokens", },)
    .post(
      `${prefix}/admin/agent-tokens`,
      async (ctx: any,) => {
        const adminId = requireUserId(ctx,);
        if (typeof adminId !== "string") { return adminId; }
        if (!can(ctx.userRole ?? null, "admin.system",)) { return forbiddenResponse(); }

        // MintBody's TypeBox number (minimum 1) rejects non-positive and
        // non-finite values at the boundary; the mint also guards its seam.
        const body = ctx.body as { scope: AgentTokenScope; ttlMs?: number };
        const { raw, hash, expiresAt, } = mintAgentToken({ ttlMs: body.ttlMs, },);
        const id = crypto.randomUUID();
        await db.insertInto("agent_tokens",).values({
          id,
          token_hash: hash,
          scope: body.scope,
          expires_at: expiresAt,
        },).execute();

        await auditTokenAction(db, "mint", adminId, id,);

        // The ONE response carrying the raw token — shown exactly once.
        return jsonResponse({ data: { id, scope: body.scope, expiresAt, token: raw, }, },);
      },
      {
        body: MintBody,
        response: t.Object({
          data: t.Object({
            id: t.String(),
            scope: t.String(),
            expiresAt: t.String(),
            token: t.String(),
          },),
        },),
        detail: {
          summary: "Mint an RSI agent token",
          description:
            "Creates an agent_tokens row with the chosen scope tier and returns the plaintext bearer token exactly once; only the SHA-256 hash is stored. Lifetime defaults to 24h; ttlMs overrides it in positive finite milliseconds. Rotation = DELETE the old token, then mint again.",
          tags: ["Admin", "Agent API",],
        },
      },
    )
    .delete(
      `${prefix}/admin/agent-tokens/:id`,
      async (ctx: any,) => {
        const adminId = requireUserId(ctx,);
        if (typeof adminId !== "string") { return adminId; }
        if (!can(ctx.userRole ?? null, "admin.system",)) { return forbiddenResponse(); }

        const row = await db
          .selectFrom("agent_tokens",)
          .select(["id", "revoked_at",],)
          .where("id", "=", ctx.params.id,)
          .executeTakeFirst();

        if (!row) { return notFoundResponse(); }

        // Row-VALUE revocation (documented refinement shared with
        // integration_tokens): the row stays as the audit trail. Idempotent.
        if (row.revoked_at === null) {
          const revokedAt = new Date().toISOString();
          await db
            .updateTable("agent_tokens",)
            .set({ revoked_at: revokedAt, },)
            .where("id", "=", row.id,)
            .execute();

          await auditTokenAction(db, "revoke", adminId, row.id,);
          return jsonResponse({ data: { id: row.id, revokedAt, }, },);
        }

        return jsonResponse({ data: { id: row.id, revokedAt: row.revoked_at, }, },);
      },
      {
        params: TokenParams,
        response: t.Object({
          data: t.Object({ id: t.String(), revokedAt: t.String(), },),
        },),
        detail: {
          summary: "Revoke an RSI agent token",
          description:
            "Stamps revoked_at on the agent_tokens row; the token fails auth afterward. Idempotent on repeat. Half of the ticket's rotation contract (revoke + re-mint).",
          tags: ["Admin", "Agent API",],
        },
      },
    );
}
