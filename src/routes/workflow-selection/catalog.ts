// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GET /api/v1/workflow-selections — the authenticated user's workflow
 * selector catalog. Per-user by design: no admin-only gate.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getWorkflowCatalog, } from "../../generation/workflow-selection";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";

/**
 * @param opts - Database handle.
 * @param prefix - API prefix, `/api/v1` in production.
 * @returns The workflow-selections Elysia sub-app.
 */
export function workflowSelectionRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return (
    new Elysia({ name: "workflow-selection-catalog", },)
      .get(
        `${prefix}/workflow-selections`,
        async (ctx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const useCases = await getWorkflowCatalog({ database, userId, },);
          return jsonResponse({ useCases, },);
        },
        {
          response: {
            200: t.Any(),
            401: ErrorResponse,
          },
          detail: {
            summary: "List workflow selections",
            description: "List supported workflows and the current user's selection per generation use case.",
            tags: ["Generation", "Workflows",],
          },
        },
      )
  );
}
