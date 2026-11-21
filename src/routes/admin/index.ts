// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { auditRoutes, } from "./audit";
import { auxTelemetryRoutes, } from "./aux-telemetry";
import { blenderStatusRoutes, } from "./blender-status";
import { carriageRoutes, } from "./carriage";
import { chatsRoutes, } from "./chats";
import { comfyUISetupRoutes, } from "./comfyui-setup";
import { comfyUIStatusRoutes, } from "./comfyui-status";
import { cronRoutes, } from "./cron";
import { dangerZoneRoutes, } from "./danger-zone";
import { dbBackupRoutes, } from "./db-backup";
import { effectiveConfigRoutes, } from "./effective-config";
import { federationAdminRoutes, } from "./federation";
import { integrationTokenRoutes, } from "./integration-tokens";
import { integrityRoutes, } from "./integrity";
import { itemPowerRoutes, } from "./item-power";
import { keyRotationRoutes, } from "./key-rotation";
import { llamaSwapRoutes, } from "./llama-swap";
import { mfaConfigRoutes, } from "./mfa-config";
import { modelCapabilitiesRoutes, } from "./model-capabilities";
import { modelRolesRoutes, } from "./model-roles";
import { newsRoutes, } from "./news";
import { providersRoutes, } from "./providers";
import { resourcesRoutes, } from "./resources";
import { reviewStatsRoutes, } from "./review-stats";
import { sdStatusRoutes, } from "./sd-status";
import { sdCppSetupRoutes, } from "./sdcpp-setup";
import { seedRoutes, } from "./seed";
import { setupProvidersRoutes, } from "./setup-providers";
import { statsRoutes, } from "./stats";
import { systemConfigRoutes, } from "./system-config";
import { usersRoutes, } from "./users";
import { watchdogRoutes, } from "./watchdog";
import { worldEventsRoutes, } from "./world-events";
import { worldsRoutes, } from "./worlds";

/**
 * Admin Routes
 *
 * Admin-only endpoints:
 *   GET  /api/admin/users          — list all users
 *   GET  /api/admin/users/:id      — get user details
 *   PATCH /api/admin/users/:id/role  — update user role
 *   DELETE /api/admin/users/:id    — delete user (admin only)
 *   GET  /api/admin/stats          — system statistics
 *   GET  /api/admin/providers      — list providers with health status
 *   GET  /api/admin/providers/:name/models — list models for a provider
 *   POST /api/admin/providers/rescan — trigger provider re-scan
 *   GET  /api/admin/setup/providers — list stored provider instances (no secrets)
 *   POST /api/admin/setup/providers — create or update a provider instance
 *   DELETE /api/admin/setup/providers/:name — delete a provider instance
 *   GET  /api/admin/blender-status — cached local Blender capability verdict
 *   GET  /api/admin/sd-status/sdcpp — probe every sd.cpp instance (reachability, version, models)
 *   POST /api/admin/sd-status/sdcpp/setup — create or update an sd.cpp instance (probe-gated)
 *   DELETE /api/admin/sd-status/sdcpp/setup/:name — delete an sd.cpp instance
 *   GET  /api/admin/model-roles    — get current role assignments
 *   PUT  /api/admin/model-roles/:role — set role override
 *   DELETE /api/admin/model-roles/:role — clear role override
 *   GET  /api/admin/model-news     — latest model news per feed family
 *   POST /api/admin/model-news/refresh — re-poll model news feeds
 *   GET  /api/admin/world-events?world_id=… — world simulation event log
 *   GET  /api/admin/watchdog/events?limit=… — watchdog state-machine exec log
 *   GET  /api/admin/cron/jobs      — list scheduled job statuses
 *   POST /api/admin/cron/jobs/:name/run — manually trigger a job
 *   GET  /api/admin/resources/inference — list provisioned inference endpoints
 *   POST /api/admin/resources/inference — add an inference endpoint
 *   DELETE /api/admin/resources/inference/:id — revoke an inference endpoint
 *   POST /api/admin/resources/inference/:id/test — dry-run probe (no call-out)
 *   GET  /api/admin/resources/storage   — list provisioned storage endpoints
 *   POST /api/admin/resources/storage   — add a storage endpoint
 *   DELETE /api/admin/resources/storage/:id — revoke a storage endpoint
 *   POST /api/admin/resources/storage/:id/test — dry-run probe (no call-out)
 *   POST /api/admin/resources/backups   — write a hash-checked backup
 *   POST /api/admin/resources/backups/:id/verify — integrity check one backup
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function adminRoutes(opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
  // Erase the accumulated Elysia generics before one more plugin; leaving the
  // whole chain inline exceeds tsgo's instantiation depth.
  const routes: Elysia = new Elysia({ name: "admin", },)
    .use(usersRoutes(opts, prefix,),)
    .use(statsRoutes(opts, prefix,),)
    .use(providersRoutes({ database: opts.database, }, prefix,),)
    .use(reviewStatsRoutes(opts, prefix,),)
    .use(resourcesRoutes(opts, prefix,),)
    .use(modelRolesRoutes(opts, prefix,),)
    .use(modelCapabilitiesRoutes(opts, prefix,),)
    .use(newsRoutes(opts, prefix,),)
    .use(blenderStatusRoutes(opts, prefix,),)
    .use(sdStatusRoutes(opts, prefix,),)
    .use(comfyUIStatusRoutes(opts, prefix,),)
    .use(sdCppSetupRoutes(opts, prefix,),)
    .use(comfyUISetupRoutes(opts, prefix,),)
    .use(systemConfigRoutes(opts, prefix,),)
    .use(setupProvidersRoutes(opts, prefix,),)
    .use(worldsRoutes(opts, prefix,),)
    .use(worldEventsRoutes(opts, prefix,),)
    .use(itemPowerRoutes(opts, prefix,),)
    .use(chatsRoutes(opts, prefix,),)
    .use(carriageRoutes(opts, prefix,),)
    .use(cronRoutes(opts, prefix,),)
    .use(auditRoutes(opts, prefix,),)
    .use(dangerZoneRoutes(opts, prefix,),)
    .use(dbBackupRoutes(opts, prefix,),)
    .use(effectiveConfigRoutes(opts, prefix,),)
    .use(seedRoutes(opts, prefix,),)
    .use(keyRotationRoutes(opts, prefix,),)
    .use(auxTelemetryRoutes(opts, prefix,),)
    .use(federationAdminRoutes(opts, prefix,),)
    // Integration tokens (ADR credentials-issuer-model admin-scoped slice).
    .use(integrationTokenRoutes(opts, prefix,),)
    .use(llamaSwapRoutes(opts, prefix,),)
    .use(mfaConfigRoutes(opts, prefix,),);

  return routes
    .use(watchdogRoutes(opts, prefix,),)
    .use(integrityRoutes(opts, prefix,),);
}
