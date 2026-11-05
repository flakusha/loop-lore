// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Setup state endpoint — GET {prefix}/setup/state.
 *
 * Admin-gated, default-deny: `requirePermissionUserId(ctx, "admin.system")`
 * answers 401 for anonymous callers and 403 for non-admins. There is NO
 * anonymous and NO booleans-only mode — the hint text and the check list are
 * operator-facing and never leak to unauthenticated callers.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requirePermissionUserId, } from "../http-utils";
import { setupChecks, } from "./checks";

/** Response schema for GET /setup/state. */
const SetupStateResponse = t.Object({
  checks: t.Array(t.Object({
    id: t.String(),
    ok: t.Boolean(),
    hint: t.Optional(t.String(),),
  },),),
},);

/**
 * @param opts - Database handle (optional) and app config.
 * @param prefix - route prefix; defaults to the versioned surface `/api/v1`.
 * @returns {Elysia}
 */
export function setupRoutes(opts: { database?: Kysely<DB>; config: Config }, prefix = "/api/v1",): Elysia {
  return new Elysia({ name: "setup-state", },)
    .get(`${prefix}/setup/state`, async (ctx: any,) => {
      const userId = requirePermissionUserId(ctx, "admin.system",);
      if (typeof userId !== "string") { return userId; }

      return jsonResponse({ checks: await setupChecks(opts.config, opts.database,), },);
    }, {
      response: {
        200: SetupStateResponse,
        403: ErrorResponse,
      },
      detail: {
        summary: "Setup state",
        description:
          "Machine-readable setup checks (env PII secrets, provider health, message encryption, main model role, native acceleration, TLS certificates). Requires the admin.system permission.",
        tags: ["Setup",],
      },
    },);
}
