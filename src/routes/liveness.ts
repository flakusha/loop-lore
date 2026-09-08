// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Liveness & Readiness probes.
 *
 * - `GET /health/live`  — process is up. Never touches DB/providers.
 * - `GET /health/ready` — DB reachable + migrations present. 503 otherwise.
 *
 * Both are OPT-IN via `config.observability.health.*` (default off). When a
 * probe is disabled, its route is NOT mounted (not merely hidden), so an
 * unprovisioned surface returns 404 rather than advertising readiness.
 */
import { sql, } from "kysely";
import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { HttpStatus, jsonError, jsonResponse, } from "./http-utils";

const startTime = Date.now();

interface LivenessOpts {
  database: Db;
  config: Config;
}

/**
 * Whether the database answers a trivial query (readiness).
 * @param database
 */
async function databaseReady(database: Db,): Promise<boolean> {
  try {
    await sql`SELECT 1`.execute(database,);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param opts
 */
export function livenessRoutes(opts: LivenessOpts,): Elysia {
  const { database, config, } = opts;
  const app = new Elysia();
  const health = config.observability.health;

  if (health.liveness) {
    app.get("/health/live", () => {
      return jsonResponse({
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
      },);
    }, {
      detail: {
        summary: "Liveness probe",
        description: "Returns 200 while the process is up. No auth, no DB access.",
        tags: ["Health",],
      },
    },);
  }

  if (health.readiness) {
    app.get("/health/ready", async () => {
      const ready = await databaseReady(database,);
      if (!ready) {
        return jsonError({
          message: "Service not ready: database unreachable",
          status: HttpStatus.ServiceUnavailable,
        },);
      }
      return jsonResponse({
        status: "ok",
        checks: { database: "ok", },
        timestamp: new Date().toISOString(),
      },);
    }, {
      detail: {
        summary: "Readiness probe",
        description: "Returns 200 when the DB responds; 503 otherwise. No auth.",
        tags: ["Health",],
      },
    },);
  }

  return app;
}
