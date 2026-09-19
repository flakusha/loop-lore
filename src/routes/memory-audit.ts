// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory audit log route (FEAT-075).
 *
 *   GET /api/actors/:actorId/memories/audit
 *     — paginated, action-filterable audit log for the actor's memories.
 *
 * Cursor pagination (not offset) so deep pages stay O(index) instead of
 * O(n). The cursor is opaque base64url(JSON) — clients round-trip it
 * without parsing.
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../db";
import { listAuditLog, type MemoryAuditAction, } from "../memory/audit";
import { checkOwnership, entityPaths, } from "./entity-routes/context";
import { jsonResponse, } from "./http-utils";

/**
 * Compile-time allowlist of audit actions. Mirrors `MemoryAuditAction` in
 * src/memory/audit.ts. Keep this in sync if you add an action.
 */
const AUDIT_ACTIONS = [
  "create",
  "pin",
  "unpin",
  "modify",
  "decay",
  "purge",
  "inject",
] as const satisfies readonly MemoryAuditAction[];

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns Elysia plugin serving the memory audit endpoint.
 */
export function memoryAuditRoutes(opts: { database: Db }, prefix = "/api",): Elysia {
  const { withIdPath, parentParam, } = entityPaths({
    parentPrefix: "actors",
    parentParam: "actorId",
    entityPath: "memories",
    entityName: "Memory",
    tableName: "actor_memories",
    parentFk: "actor_id",
    ownershipTable: "actors",
    ownershipFkColumn: "user_id",
    orderBy: [],
    fieldMappings: {},
    createRequired: [],
  } as never, prefix,);

  return new Elysia({ name: "memory-audit", },)
    .get(`${withIdPath}/audit`, async (ctx,) => {
      const parentId = (ctx.params as Record<string, string | undefined>)[parentParam];
      const userId = (ctx as unknown as { userId: string | null }).userId;
      const userRole = (ctx as unknown as { userRole: string | null }).userRole;
      if (!parentId) { return jsonResponse({ entries: [], },); }

      const ownershipOk = await checkOwnership(
        opts.database,
        {
          parentPrefix: "actors",
          parentParam: "actorId",
          entityPath: "memories",
          entityName: "Memory",
          tableName: "actor_memories",
          parentFk: "actor_id",
          ownershipTable: "actors",
          ownershipFkColumn: "user_id",
          orderBy: [],
          fieldMappings: {},
          createRequired: [],
        } as never,
        parentId,
        userId,
        userRole,
      );
      if (!ownershipOk) { return jsonResponse({ entries: [], },); }

      const query = ctx.query as {
        action?: string;
        since?: string;
        until?: string;
        cursor?: string;
        limit?: string;
      };
      const action = AUDIT_ACTIONS.find((a,) => a === query.action);
      const limit = query.limit ? Number.parseInt(query.limit, 10,) : undefined;

      const result = await listAuditLog(opts.database, parentId, {
        action,
        since: query.since,
        until: query.until,
        cursor: query.cursor,
        limit: Number.isFinite(limit,) ? limit : undefined,
      },);
      return jsonResponse(result,);
    }, {
      query: t.Object({
        action: t.Optional(t.Union(AUDIT_ACTIONS.map((a,) => t.Literal(a,)),),),
        since: t.Optional(t.String({ format: "date-time", },),),
        until: t.Optional(t.String({ format: "date-time", },),),
        cursor: t.Optional(t.String(),),
        limit: t.Optional(t.String(),),
      },),
      detail: {
        summary: "List memory audit log",
        description: "Cursor-paginated audit log for an actor's memories (FEAT-075).",
        tags: ["Memory",],
      },
    },);
}
