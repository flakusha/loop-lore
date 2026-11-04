// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness model discovery API
 * (TASK-model-discovery-capability-enrichment): a read-only per-profile
 * model listing merged with the static capability table. Admin-gated like
 * the rest of the harness surface; discovery asks the composed runtime's
 * EXISTING connections only — it never spawns a harness binary just to
 * list models — so a disabled/unbooted integration reads 503 and a profile
 * without a live connection reports its static config instead.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { HarnessModelsResponse, } from "../../frontend/alpine/admin-harness-schema";
import { discoverHarnessModels, } from "../../integrations/harness/model-discovery";
import { getHarnessRuntime, } from "../../integrations/harness/runtime";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/** Error when the runtime (and with it every connection) is not composed. */
const NOT_COMPOSED = {
  message: "harness runtime not composed — the ACP integration is disabled or not booted",
  status: HttpStatus.ServiceUnavailable,
  code: ErrorCode.ServiceUnavailable,
} as const;

/**
 * Build the harness model discovery route plugin.
 * @param options - injected database handle (the static capability table).
 * @param prefix - Mount prefix. Admin-gated like the rest of the harness
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessModelRoutes(options: { database: Kysely<DB> }, prefix = "/api/v1",) {
  const guard = requirePermission("admin.system",);
  const denied = { 403: ErrorResponse, } as const;

  return new Elysia({ name: "harness-models", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app.get(`${prefix}/harness/models`, async () => {
        const runtime = getHarnessRuntime();
        if (!runtime) { return jsonError(NOT_COMPOSED,); }

        const profiles = await discoverHarnessModels({ runtime, db: options.database, },);
        return jsonResponse({ items: profiles.flatMap((profile,) => profile.models), },);
      }, {
        response: { 200: HarnessModelsResponse, 503: ErrorResponse, ...denied, },
      },),);
}
