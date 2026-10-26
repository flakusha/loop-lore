// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Health Check Endpoint
 *
 * GET /api/health — Returns server health status.
 * No authentication required (used by load balancers, monitoring), so the
 * body carries no upstream error text and no per-provider detail: raw error
 * strings leak internal endpoints and vendor responses to anonymous callers.
 * The full per-provider detail (label, model count, latency, error) stays on
 * the permission-gated /api/admin/providers surface.
 *
 * The probe surface is deliberately UNVERSIONED: `docs/ops/bare-metal-deploy.md`
 * §10.2 requires `curl -fsS .../api/health` to return `200` (curl without `-L`
 * reports the 308 and an empty body, so a redirect fails that check),
 * `deploy/docker-compose.yml` polls `/api/health`, and
 * `src/routes/v1/v1-enforcement.test.ts` pins the contract that unversioned
 * infra surfaces answer directly instead of 308-ing into v1.
 * `src/app/register-plugins.ts` mounts this factory with the `/api` prefix; the
 * v1 barrel (`src/routes/v1/base-surface.ts`) mounts it with an explicit
 * `/api/v1` so the versioned surface still serves `/api/v1/health`.
 */
import { Elysia, } from "elysia";
import { getHealthCache, hasUnhealthyProviders, } from "../admin/provider-health";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { SuccessResponse, } from "../validation/schemas";
import { jsonResponse, } from "./http-utils";

const startTime = Date.now();

/**
 * @param _opts
 * @param _opts.database
 * @param _opts.config
 * @param prefix - route prefix; defaults to the unversioned probe surface `/api`
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function healthRoutes(_opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
  return new Elysia().get(`${prefix}/health`, () => {
    const providers = getHealthCache();
    const degraded = hasUnhealthyProviders();
    const uptime = Math.floor((Date.now() - startTime) / 1000,);
    const timestamp = new Date().toISOString();
    const providerList = Array.from(providers, (p,) => ({ name: p.name, status: p.status, }),);

    return jsonResponse({
      status: degraded ? "degraded" : "ok",
      uptime,
      timestamp,
      providers: providerList,
    },);
  }, {
    response: {
      200: SuccessResponse,
    },
    detail: {
      summary: "Health check",
      description:
        "Returns server health status and per-provider name/status. No upstream error text, no authentication required.",
      tags: ["Health",],
    },
  },);
}
