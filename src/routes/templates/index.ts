// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt template routes facade — assembles the HTTP surface (FEAT-065):
 *
 *   CRUD:    src/routes/templates/crud.ts
 *   Apply:   src/routes/templates/apply.ts
 *   I/O:     src/routes/templates/transfer.ts
 *
 *   GET    /api/templates             — list (owner rows + LLM presets)
 *   POST   /api/templates             — create
 *   GET    /api/templates/:id         — retrieve
 *   PATCH  /api/templates/:id         — update (owner only)
 *   DELETE /api/templates/:id         — delete (owner only)
 *   POST   /api/templates/:id/apply   — render with context
 *   GET    /api/templates/export      — JSON pack export
 *   POST   /api/templates/import      — JSON pack import
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { templateApplyRoutes, } from "./apply";
import { templateCrudRoutes, } from "./crud";
import { templateTransferRoutes, } from "./transfer";

/**
 * @param opts - Handler options
 * @param prefix - Route prefix
 */
export function promptTemplateRoutes(
  opts: { database: Kysely<DB> },
  prefix = "/api",
) {
  return new Elysia({ name: "prompt-templates", },)
    .use(templateCrudRoutes(opts, prefix,),)
    .use(templateApplyRoutes(opts, prefix,),)
    .use(templateTransferRoutes(opts, prefix,),);
}
