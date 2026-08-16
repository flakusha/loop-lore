import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { auditRoutes, } from "./audit";
import { chatsRoutes, } from "./chats";
import { dangerZoneRoutes, } from "./danger-zone";
import { keyRotationRoutes, } from "./key-rotation";
import { modelCapabilitiesRoutes, } from "./model-capabilities";
import { modelRolesRoutes, } from "./model-roles";
import { providersRoutes, } from "./providers";
import { reviewStatsRoutes, } from "./review-stats";
import { sdStatusRoutes, } from "./sd-status";
import { statsRoutes, } from "./stats";
import { systemConfigRoutes, } from "./system-config";
import { templatesRoutes, } from "./templates";
import { usersRoutes, } from "./users";
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
 *   GET  /api/admin/model-roles    — get current role assignments
 *   PUT  /api/admin/model-roles/:role — set role override
 *   DELETE /api/admin/model-roles/:role — clear role override
 */
export function adminRoutes(opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
  return (
    new Elysia({ name: "admin", },)
      .use(usersRoutes(opts, prefix,),)
      .use(statsRoutes(opts, prefix,),)
      .use(providersRoutes({ database: opts.database, }, prefix,),)
      .use(reviewStatsRoutes(opts, prefix,),)
      .use(modelRolesRoutes(opts, prefix,),)
      .use(modelCapabilitiesRoutes(opts, prefix,),)
      .use(sdStatusRoutes(opts, prefix,),)
      .use(systemConfigRoutes(opts, prefix,),)
      .use(worldsRoutes(opts, prefix,),)
      .use(chatsRoutes(opts, prefix,),)
      .use(templatesRoutes(opts, prefix,),)
      .use(auditRoutes(opts, prefix,),)
      .use(dangerZoneRoutes(opts, prefix,),)
      .use(keyRotationRoutes(opts, prefix,),)
  );
}
