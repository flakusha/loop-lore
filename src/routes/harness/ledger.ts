// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Usage-ledger read API (TASK-harness-telemetry-metrics-health-signal-usage-ledger-endpoint).
 *
 * `GET /api/v1/harness/ledger` — the RAW rows of the in-memory usage ledger
 * (one per profile the ledger has seen, insertion order), admin-gated like
 * the rest of the harness surface; 503 when the runtime is not composed, so
 * the surface is inert rather than auto-anything.
 *
 * Distinct from `GET /harness/usage`, which merges the SAME ledger snapshot
 * with the per-profile breaker state through the shared read view. This
 * endpoint is the ledger alone — the quota surface (`quotaResetAt`) for every
 * profile the ledger knows, without a breaker column that only applies to
 * composed profiles.
 *
 * The wire schema is declared HERE rather than in the frontend schema barrel,
 * same as the usage route: nothing decodes it yet, and a barrel shape nothing
 * decodes would be a second, undrilled contract.
 */
import { Elysia, t, } from "elysia";
import { getHarnessRuntime, } from "../../integrations/harness/runtime";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/** Error when the runtime (and with it the ledger) is not composed. */
const NOT_COMPOSED = {
  message: "harness runtime not composed — the ACP integration is disabled or not booted",
  status: HttpStatus.ServiceUnavailable,
  code: ErrorCode.ServiceUnavailable,
} as const;

/** One ledger row on the wire (a `HarnessUsageSnapshot`). */
const HarnessLedgerRowSchema = t.Object({
  profile: t.String(),
  dispatchesInWindow: t.Number(),
  tokensInDay: t.Number(),
  quotaResetAt: t.Union([t.Number(), t.Null(),],),
},);

/** `GET /api/v1/harness/ledger` body. */
const HarnessLedgerResponse = t.Object({
  items: t.Array(HarnessLedgerRowSchema,),
},);

/**
 * Build the harness ledger route plugin.
 * @param prefix - Mount prefix. Admin-gated like the rest of the harness
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessLedgerRoutes(prefix = "/api/v1",) {
  const guard = requirePermission("admin.system",);
  const denied = { 403: ErrorResponse, } as const;

  return new Elysia({ name: "harness-ledger", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app.get(`${prefix}/harness/ledger`, async () => {
        const runtime = getHarnessRuntime();
        if (!runtime) { return jsonError(NOT_COMPOSED,); }

        return jsonResponse({ items: runtime.ledger.snapshot(), },);
      }, {
        response: { 200: HarnessLedgerResponse, 503: ErrorResponse, ...denied, },
      },),);
}
