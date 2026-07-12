/**
 * Health Check Endpoint
 *
 * GET /api/health — Returns server health status including provider connectivity.
 * No authentication required (used by load balancers, monitoring).
 */
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { jsonResponse } from "./http-utils";
import { getHealthCache, hasUnhealthyProviders, providerToSummary } from "../admin/provider-health";

const startTime = Date.now();

const dispatch: RouteDispatch = () => {
  const providers = getHealthCache();
  const degraded = hasUnhealthyProviders();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const timestamp = new Date().toISOString();
  const providerList = providers.map((p) => providerToSummary(p));

  return Promise.resolve(
    jsonResponse({
      status: degraded ? "degraded" : "ok",
      uptime,
      timestamp,
      providers: providerList,
    }),
  );
};

registerRoute(dispatch);
export { dispatch };
