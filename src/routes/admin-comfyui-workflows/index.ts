// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin ComfyUI Workflow Management — barrel assembling the HTTP surface from
 * one sub-plugin per concern. Every sub-plugin applies the `admin.settings`
 * guard itself and scopes every query to the `workflow` modality, so this
 * surface cannot reach an LLM or image template row.
 *
 * The prefix is its own rather than a sub-path of `/api/admin/templates` or
 * `/api/admin/sd-templates`, which the prompt-template-profiles and SD image
 * surfaces already own.
 *
 *   GET    /api/admin/comfyui-workflows              — list rows (?enabled=)
 *   GET    /api/admin/comfyui-workflows/:id          — one row with payload
 *   POST   /api/admin/comfyui-workflows              — ingest an uploaded graph
 *   PUT    /api/admin/comfyui-workflows/:id          — update metadata/graph
 *   DELETE /api/admin/comfyui-workflows/:id          — delete
 *   POST   /api/admin/comfyui-workflows/:id/default   — set default
 *   POST   /api/admin/comfyui-workflows/:id/enabled  — toggle enabled
 * @module routes/admin-comfyui-workflows
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createRoutes, } from "./create";
import { flagRoutes, } from "./flags";
import { listRoutes, } from "./list";
import { removeRoutes, } from "./remove";
import { updateRoutes, } from "./update";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { "comfyui-workflows": { ...; }; }; }; } & ... 5 more ... & { ...; }, { ...; }, { ...; } & { ...; }>}
 */
export function adminComfyuiWorkflowRoutes(
  opts: { database: Kysely<DB> },
  prefix = "/api",
) {
  return (
    new Elysia({ name: "admin-comfyui-workflows", },)
      .use(listRoutes(opts, prefix,),)
      .use(createRoutes(opts, prefix,),)
      .use(updateRoutes(opts, prefix,),)
      .use(flagRoutes(opts, prefix,),)
      .use(removeRoutes(opts, prefix,),)
  );
}
