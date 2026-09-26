// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Agency routes barrel — assembles the story-point HTTP surface from
 * domain sub-plugins. Registration point/name is preserved so the
 * `register-plugins.ts` wiring is unchanged.
 *
 *   POST /api/agency/spend — debit story points
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { agencySpendRoute, } from "./spend";

export interface AgencyHandlerOpts {
  database: Kysely<DB>;
}

export function agencyRoutes(opts: AgencyHandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "agency", },).use(agencySpendRoute(opts, prefix,),);
}
