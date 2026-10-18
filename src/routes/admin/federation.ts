// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Federation admin surface — one mount point for the three sub-routers.
 *
 * Kept as its own module (rather than three `.use` calls in `./index.ts`) so
 * the derived options object lives in one place: `federation.enabled` and the
 * BYOK encryption key are read here and nowhere else.
 *
 * Every route gates on the EXISTING `admin.system` permission. This epic adds no
 * `federation.*` permission string.
 */

import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import type { PeerProbeFetch, } from "../../federation/peer-health-probe";
import { federationBudgetRoutes, } from "./federation-budgets";
import { federationPeersRoutes, } from "./federation-peers";
import type { AdminFederationRouteOpts, } from "./federation-types";
import { federationUsageRoutes, } from "./federation-usage";

/**
 * Mount the federation admin routes.
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param opts.probeFetch Test seam for the save-time health probe.
 * @param prefix
 * @returns {Elysia}
 */
export function federationAdminRoutes(
  opts: { database: Db; config: Config; probeFetch?: PeerProbeFetch },
  prefix = "/api",
): Elysia {
  const routeOpts: AdminFederationRouteOpts = {
    database: opts.database,
    config: opts.config,
    federationEnabled: opts.config.federation.enabled,
    // The BYOK encryption key is optional in the config schema; the registry's
    // encrypt-then-store path needs one, so an instance without it passes the
    // empty string and the save is refused by the token write rather than
    // storing a token encrypted under no key.
    encryptionKey: opts.config.byoKey.encryptionKey ?? "",
    ...(opts.probeFetch === undefined ? {} : { probeFetch: opts.probeFetch, }),
  };

  return new Elysia({ name: "admin-federation", },)
    .use(federationPeersRoutes(routeOpts, prefix,),)
    .use(federationBudgetRoutes(routeOpts, prefix,),)
    .use(federationUsageRoutes(routeOpts, prefix,),);
}
