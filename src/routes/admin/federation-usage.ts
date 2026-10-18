// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The usage/quota dashboard read.
 *
 * `GET /api/admin/federation/usage` returns, per peer: link kind, trust state,
 * declared vs advertised classes, circuit state, in-flight, latency EWMA,
 * headroom, budget vs usage for performance, and storage usage — assembled by
 * the pure `buildAdminFederationView` so the projection itself is unit testable.
 *
 * No response field can carry a shared token. The projection's peer type is
 * `WorkloadPeer`, which exposes only `hasSharedToken`.
 */

import { Elysia, t, } from "elysia";
import { buildAdminFederationView, } from "../../federation/admin-federation-view";
import { readAdminStorageUsage, } from "../../federation/admin-storage-accessor";
import { listWorkloadPeers, } from "../../federation/peer-registry";
import { listPerformanceBudgets, } from "../../federation/performance-quota-store";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, withPermissionAuth, } from "../http-utils";
import type { AdminFederationRouteOpts, } from "./federation-types";

/**
 * The dashboard read. Gated on the existing `admin.system` permission, and it
 * reports the OFF state rather than refusing, so the panel can render an
 * explicit 'federation is off' view instead of an error toast.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function federationUsageRoutes(opts: AdminFederationRouteOpts, prefix = "/api",) {
  const db = opts.database;
  return new Elysia({ name: "admin-federation-usage", },)
    .get(`${prefix}/admin/federation/usage`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async () => {
        if (!opts.federationEnabled) {
          return jsonResponse({ enabled: false, peers: [], storage: null, },);
        }

        // Sequential rather than `Promise.all`: the repo bans it (an unhandled
        // rejection in one leg would strand the others), and these are three
        // indexed reads on one connection that gain nothing from overlapping.
        const peers = await listWorkloadPeers(db,);
        const budgets = await listPerformanceBudgets(db,);
        const storage = await readAdminStorageUsage({ database: db, },);

        return jsonResponse({
          enabled: true,
          ...buildAdminFederationView({ peers, budgets, storage, },),
        },);
      },);
    }, { response: { 200: t.Any(), 403: ErrorResponse, }, },);
}
