// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin CRUD for integration tokens (ADR-credentials-issuer-model §Decision
 * a — admin-scoped, server-provided capability for integration clients).
 *
 *   POST   /admin/integration-tokens        mint — raw token returned ONCE
 *   GET    /admin/integration-tokens        list — NO secret material
 *   DELETE /admin/integration-tokens/:id    revoke (row-value revoked_at)
 *
 * Guard: the standard admin triple (`requireUserId` + `can("admin.system")`)
 * — same shape as carriage/metrics. Cross-admin by design: ANY admin-class
 * caller may list and revoke (these are server-provided capabilities, not
 * personal property); the minter is recorded as `issuer_admin_user_id`.
 * Integration-token principals can NEVER reach this surface — the auth chain
 * confines `external-agent` to `integrations/` paths, so tokens cannot mint
 * or revoke tokens (privilege-escalation proof pinned in tests).
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import type { IntegrationTokenScope, } from "../../db/enums";
import { logEntryEnvelope, } from "../../db/log-entries";
import { getChildLogger, } from "../../logger";
import { mintIntegrationToken, } from "../../middleware/auth/integration-token";
import { can, } from "../../users/permissions";
import { safeJsonStringify, } from "../../utils";
import { toDate, } from "../../utils/date";
import { forbiddenResponse, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** TypeBox body for minting — expiry OPTIONAL, default non-expiring (open ADR
 * lifetime question; the schema never presumes an answer). The tier union is
 * the FacadeScope vocabulary (IntegrationTokenScope values). */
const MintBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 120, },),
  scopes: t.Union([t.Literal("read",), t.Literal("chat-write",),],),
  expiresAt: t.Optional(t.String({ minLength: 1, },),),
},);

/** Admin-facing projection — secret material (hash + raw) never leaves. */
interface TokenView {
  id: string;
  name: string;
  scopes: IntegrationTokenScope;
  issuerAdminUserId: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}

function toView(row: {
  id: string;
  name: string;
  scopes: string;
  issuer_admin_user_id: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
},): TokenView {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes as IntegrationTokenScope,
    issuerAdminUserId: row.issuer_admin_user_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
  };
}

/** Best-effort audit row for mint/revoke (same sink as the facade audit). */
async function auditTokenAction(
  database: Db,
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
        message: `admin integration-token ${action}`,
        module: "admin",
        event_type: "admin.integration_token",
        action,
        entity_type: "integration_token",
        entity_id: tokenId,
        user_id: adminId,
        meta: meta.ok ? meta.value : "{}",
      },)
      .execute();
  } catch (error) {
    getChildLogger("admin.integration-tokens",)?.error(
      "integration-token audit write failed",
      error instanceof Error ? error : undefined,
      { tokenId, },
    );
  }
}

/**
 * Integration-token admin CRUD plugin (mounts under the admin barrel).
 * @param opts - database/config threaded like every admin plugin
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the Elysia plugin
 */
export function integrationTokenRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;

  return new Elysia({ name: "admin-integration-tokens", },)
    .post(
      `${prefix}/admin/integration-tokens`,
      async (ctx: any,) => {
        const adminId = requireUserId(ctx,);
        if (typeof adminId !== "string") { return adminId; }
        if (!can(ctx.userRole ?? null, "admin.system",)) { return forbiddenResponse(); }

        const body = ctx.body as { name: string; scopes: "read" | "chat-write"; expiresAt?: string };
        // A present-but-unparseable expiry would corrupt every future lookup
        // (the seam fails closed on it) — reject at mint time instead.
        let expiresAt: string | null = null;
        if (body.expiresAt !== undefined) {
          const parsed = toDate(body.expiresAt,);
          if (Number.isNaN(parsed.getTime(),)) {
            return jsonResponse({
              error: "invalid_expires_at",
              message: "expiresAt must be an ISO 8601 instant",
            }, 400,);
          }

          expiresAt = parsed.toISOString();
        }

        const { raw, hash, } = mintIntegrationToken();
        const id = crypto.randomUUID();
        await db.insertInto("integration_tokens",).values({
          id,
          name: body.name,
          token_hash: hash,
          scopes: body.scopes,
          issuer_admin_user_id: adminId,
          expires_at: expiresAt,
        },).execute();

        await auditTokenAction(db, "mint", adminId, id,);

        // The ONE response carrying the raw token — shown exactly once.
        return jsonResponse({
          data: { id, name: body.name, scopes: body.scopes, expiresAt, token: raw, },
        },);
      },
      { body: MintBody, },
    )
    .get(
      `${prefix}/admin/integration-tokens`,
      async (ctx: any,) => {
        const adminId = requireUserId(ctx,);
        if (typeof adminId !== "string") { return adminId; }
        if (!can(ctx.userRole ?? null, "admin.system",)) { return forbiddenResponse(); }

        // List is cross-admin and SECRET-FREE: no token_hash, no raw token.
        const rows = await db
          .selectFrom("integration_tokens",)
          .select([
            "id",
            "name",
            "scopes",
            "issuer_admin_user_id",
            "created_at",
            "last_used_at",
            "revoked_at",
            "expires_at",
          ],)
          .orderBy("created_at", "desc",)
          .execute();

        return jsonResponse({ data: rows.map((row,) => toView(row,)), },);
      },
    )
    .delete(
      `${prefix}/admin/integration-tokens/:id`,
      async (ctx: any,) => {
        const adminId = requireUserId(ctx,);
        if (typeof adminId !== "string") { return adminId; }
        if (!can(ctx.userRole ?? null, "admin.system",)) { return forbiddenResponse(); }

        const row = await db
          .selectFrom("integration_tokens",)
          .select(["id", "revoked_at",],)
          .where("id", "=", ctx.params.id,)
          .executeTakeFirst();

        if (!row) { return notFoundResponse(); }

        // Row-VALUE revocation (documented refinement of the ADR's "row
        // deletion"): the row stays as the audit trail. Idempotent on repeat.
        if (row.revoked_at === null) {
          const revokedAt = new Date().toISOString();
          await db
            .updateTable("integration_tokens",)
            .set({ revoked_at: revokedAt, },)
            .where("id", "=", row.id,)
            .execute();

          await auditTokenAction(db, "revoke", adminId, row.id,);
          return jsonResponse({ data: { id: row.id, revokedAt, }, },);
        }

        return jsonResponse({ data: { id: row.id, revokedAt: row.revoked_at, }, },);
      },
      { params: t.Object({ id: t.String({ minLength: 1, },), },), },
    );
}
