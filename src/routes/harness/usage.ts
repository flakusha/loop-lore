// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness usage API (TASK-harness-telemetry-metrics-health-signal-usage-ledger-endpoint):
 * the per-profile rolling usage windows and the per-profile breaker state,
 * read off the composed runtime. Admin-gated like the rest of the harness
 * surface; the ledger and the breaker live on the runtime, so a disabled or
 * unbooted integration reads 503 — the surface is inert, never auto-anything.
 *
 * The wire schema is declared HERE rather than in the frontend schema barrel:
 * the admin panel does not render this yet, and a barrel shape nothing
 * decodes would be a second, undrilled contract.
 */
import { Elysia, t, } from "elysia";
import { getHarnessRuntime, } from "../../integrations/harness/runtime";
import { harnessProfileUsage, } from "../../integrations/harness/usage-view";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/** Error when the runtime (and with it the ledger) is not composed. */
const NOT_COMPOSED = {
  message: "harness runtime not composed — the ACP integration is disabled or not booted",
  status: HttpStatus.ServiceUnavailable,
  code: ErrorCode.ServiceUnavailable,
} as const;

/** One profile's usage windows and breaker state on the wire. */
const HarnessUsageProfileSchema = t.Object({
  profile: t.String(),
  dispatchesInWindow: t.Number(),
  tokensInDay: t.Number(),
  quotaResetAt: t.Union([t.Number(), t.Null(),],),
  breakerOpen: t.Boolean(),
  breakerCooldownRemainingMs: t.Number(),
},);

/** `GET /api/v1/harness/usage` body. */
const HarnessUsageResponse = t.Object({
  items: t.Array(HarnessUsageProfileSchema,),
},);

/**
 * Build the harness usage route plugin.
 * @param prefix - Mount prefix. Admin-gated like the rest of the harness
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessUsageRoutes(prefix = "/api/v1",) {
  const guard = requirePermission("admin.system",);
  const denied = { 403: ErrorResponse, } as const;

  return new Elysia({ name: "harness-usage", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app.get(`${prefix}/harness/usage`, async () => {
        const runtime = getHarnessRuntime();
        if (!runtime) { return jsonError(NOT_COMPOSED,); }

        return jsonResponse({ items: harnessProfileUsage(runtime,), },);
      }, {
        response: { 200: HarnessUsageResponse, 503: ErrorResponse, ...denied, },
      },),);
}
