// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt template routes facade — assembles the HTTP surface (FEAT-065):
 *
 *   CRUD:     src/routes/templates/crud.ts
 *   Apply:    src/routes/templates/apply.ts
 *   I/O:      src/routes/templates/transfer.ts
 *   Modality: src/routes/templates/modality.ts (video | audio)
 *
 *   GET    /api/templates             — list (owner rows + LLM presets)
 *   POST   /api/templates             — create
 *   GET    /api/templates/:id         — retrieve
 *   PATCH  /api/templates/:id         — update (owner only)
 *   DELETE /api/templates/:id         — delete (owner only)
 *   POST   /api/templates/:id/apply   — render with context
 *   GET    /api/templates/export      — JSON pack export
 *   POST   /api/templates/import      — JSON pack import
 *
 *   Per-modality (FEAT-065 SUB-VIDEO / SUB-AUDIO), same handler contract:
 *   GET|POST /api/templates/video|audio, GET|PATCH|DELETE .../:id,
 *   POST .../:id/apply (501 until a video/audio provider exists)
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { templateApplyRoutes, } from "./apply";
import { templateCrudRoutes, } from "./crud";
import { modalityTemplateRoutes, } from "./modality";
import { templateTransferRoutes, } from "./transfer";

/**
 * @param opts - Handler options
 * @param prefix - Route prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { templates: { get: { ...; }; }; }; } & ... 6 more ... & { ...; }, { ...; }, { ...; } & { ...; }>}
 */
export function promptTemplateRoutes(
  opts: { database: Kysely<DB> },
  prefix = "/api",
) {
  return new Elysia({ name: "prompt-templates", },)
    .use(templateCrudRoutes(opts, prefix,),)
    .use(templateApplyRoutes(opts, prefix,),)
    .use(templateTransferRoutes(opts, prefix,),)
    .use(modalityTemplateRoutes("video", opts, prefix,),)
    .use(modalityTemplateRoutes("audio", opts, prefix,),);
}
