/**
 * Telemetry Middleware
 *
 * Fetches telemetry metrics for admin dashboard
 */

import { type Context, } from "elysia";
import { getLogger, } from "../logger";
import { isTelemetryEnabled, } from "../telemetry/service";

export const telemetryAdmin = async (_ctx: Context, next: () => Promise<void>,) => {
  if (!isTelemetryEnabled()) {
    return next();
  }

  try {
    // Placeholder for admin context and metrics fetching
    // Implementation depends on admin context structure
  } catch (error) {
    getLogger().error(
      "Telemetry admin fetch failed",
      error instanceof Error ? error : new Error(String(error,),),
    );
  }

  return next();
};
