// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 adminSurface barrel (split out: one Elysia chain per file keeps TS2589 away).
 */
import { Elysia, } from "elysia";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { adminRoutes, } from "../admin";
import { adminCharacterOverridesRoutes, } from "../admin-character-overrides";
import { adminNsfwRoutes, } from "../admin-nsfw";
import { adminTemplateRoutes, } from "../admin-templates";
import { sdTemplatesRoutes, } from "../admin/sd-templates";
import { commandsRoutes, } from "../commands";
import { exportRoutes, } from "../export";
import { exportSseRoutes, } from "../export-sse";
import { importRoutes, } from "../import";
import { pluginRoutes, } from "../plugins";
import { worldImportRoutes, } from "../world-import";
import { versionedOpenApiPlugin, } from "./openapi";

export function adminSurface(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";
  return new Elysia({ name: "v1-admin", },)
    // ── Admin & plugins ──────────────────────────────────────
    .use(adminRoutes(handleOpts, prefix,),)
    .use(sdTemplatesRoutes(handleOpts, prefix,),)
    .use(pluginRoutes(handleOpts, prefix,),)
    .use(adminCharacterOverridesRoutes(handleOpts, prefix,),)
    .use(adminTemplateRoutes({ database, }, prefix,),)
    .use(adminNsfwRoutes({ database, }, prefix,),)
    .use(commandsRoutes({ prefix, },),)
    // ── Import / export ──────────────────────────────────────
    .use(importRoutes(handleOpts, prefix,),)
    .use(exportRoutes({ database, }, prefix,),)
    .use(exportSseRoutes({ database, }, prefix,),)
    .use(worldImportRoutes(handleOpts, prefix,),)
    .use(versionedOpenApiPlugin({ version: "1", },),);
}
