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
import { jsonResponse, } from "./http-utils";

const startTime = Date.now();

export function healthRoutes(_opts: { database: Db; config: Config },): Elysia {
  return new Elysia().get("/api/health", () => {
    const providers = getHealthCache();
    const degraded = hasUnhealthyProviders();
    const uptime = Math.floor((Date.now() - startTime) / 1000,);
    const timestamp = new Date().toISOString();
    const providerList = providers.map((p,) => providerToSummary(p,));

    return jsonResponse({
      status: degraded ? "degraded" : "ok",
      uptime,
      timestamp,
      providers: providerList,
    },);
  }, {
    detail: {
      summary: "Health check",
      description: "Returns server health status including provider connectivity. No authentication required.",
      tags: ["Health",],
    },
  },) as unknown as Elysia;
}
