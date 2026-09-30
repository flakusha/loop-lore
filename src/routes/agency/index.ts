// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Agency routes barrel — assembles the story-point HTTP surface from
 * domain sub-plugins. Registration point/name is preserved so the
 * `register-plugins.ts` wiring is unchanged.
 *
 *   GET  /api/agency/balance — read the caller's balance (composer chip)
 *   POST /api/agency/spend   — debit story points
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { agencyBalanceRoute, } from "./balance";
import { agencySpendRoute, } from "./spend";

export interface AgencyHandlerOpts {
  database: Kysely<DB>;
}

/**
 * @param {AgencyHandlerOpts} opts
 * @param {unknown} prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { agency: { balance: { ...; }; }; }; } & { ...; }, { ...; }, { ...; } & { ...; }>}
 */
export function agencyRoutes(opts: AgencyHandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "agency", },)
    .use(agencyBalanceRoute(opts, prefix,),)
    .use(agencySpendRoute(opts, prefix,),);
}
