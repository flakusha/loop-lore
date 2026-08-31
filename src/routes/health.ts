// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Health Check Endpoint
 *
 * GET /api/health — Returns server health status including provider connectivity.
 * No authentication required (used by load balancers, monitoring).
 */
import { Elysia, } from "elysia";
import { getHealthCache, hasUnhealthyProviders, providerToSummary, } from "../admin/provider-health";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { SuccessResponse, } from "../validation/schemas";
import { jsonResponse, } from "./http-utils";

const startTime = Date.now();

/**
 * @param _opts
 * @param _opts.database
 * @param _opts.config
 * @param prefix
 */
export function healthRoutes(_opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
  return new Elysia().get(`${prefix}/health`, () => {
    const providers = getHealthCache();
    const degraded = hasUnhealthyProviders();
    const uptime = Math.floor((Date.now() - startTime) / 1000,);
    const timestamp = new Date().toISOString();
    const providerList = Array.from(providers, (p,) => providerToSummary(p,),);

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
      description: "Returns server health status including provider connectivity. No authentication required.",
      tags: ["Health",],
    },
  },);
}
