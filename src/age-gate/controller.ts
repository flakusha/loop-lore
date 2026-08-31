// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Age Gate Controller (Routes)
 *
 * REST endpoints for age verification:
 *
 *   GET  /api/age-gate/status   — check whether age gate applies to the current user
 *   POST /api/age-gate/accept   — accept the age gate (submit birth date)
 *   GET  /api/admin/age-gate    — (admin) view current age gate config
 *   PUT  /api/admin/age-gate    — (admin) update age gate config (runtime toggle)
 *
 * All endpoints are no-ops when the age gate is disabled in config.
 * Responses are JSON.
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { AgeGateConfig, } from "../config/schema";
import { AgeGateMode, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { can, } from "../users/permissions";
import * as AgeGateService from "./service";

import { jsonError, jsonResponse, } from "../routes/http-utils";

// ── Age Gate Config Singleton ─────────────────────────────────

/**
 * Singleton class for age gate runtime config.
 * Prevents module-level mutable state issues.
 */
/** In-memory store for age-gate configuration. */
class AgeGateConfigStore {
  private config: AgeGateConfig = { enabled: false, minimumAge: 18, mode: "self-declaration", };

  /**
   * Initialize the store with config.
   * @param config - Age-gate configuration.
   */
  init(config: AgeGateConfig,): void {
    this.config = { ...config, };
  }

  /**
   * Get the current config.
   * @returns Current configuration.
   */
  get(): AgeGateConfig {
    return { ...this.config, };
  }

  /**
   * Update the config partially.
   * @param partial - Partial config to merge.
   */
  update(partial: Partial<AgeGateConfig>,): void {
    this.config = { ...this.config, ...partial, };
  }
}

export const ageGateConfig = new AgeGateConfigStore();

/**
 * Seed the runtime config. Called once during server start.
 * @param config - Age-gate configuration.
 */
export function initAgeGate(config: AgeGateConfig,): void {
  ageGateConfig.init(config,);
}

/**
 * Read the current (possibly admin-overridden) runtime config.
 * @returns Current age-gate configuration.
 */
export function getRuntimeConfig(): AgeGateConfig {
  return ageGateConfig.get();
}

// ── Options objects ──────────────────────────────────────────

/** Options for handleAccept. */
export interface HandleAcceptOpts {
  database: Kysely<DB>;
  userId: string | null;
  body: unknown;
}

// ── Route handlers ───────────────────────────────────────────

/**
 * GET /api/age-gate/status
 *
 * Returns whether the age gate is enabled and whether the current
 * user has passed it. The caller must have been authenticated by
 * middleware, with `userId` set on the request context.
 * @param database - Database instance.
 * @param userId - Optional user ID from auth middleware.
 * @returns JSON response with age-gate status.
 */
export async function handleGetStatus(database: Kysely<DB>, userId?: string | null,): Promise<Response> {
  try {
    let user: { birth_date: string | null; age_gate_accepted_at: string | null } | undefined;

    if (userId) {
      user = await database
        .selectFrom("users",)
        .select(["birth_date", "age_gate_accepted_at",],)
        .where("id", "=", userId,)
        .executeTakeFirst();
    }

    const status = AgeGateService.getStatus(ageGateConfig.get(), user ?? null,);
    return jsonResponse(status,);
  } catch (error) {
    // Never leak DB internals to the client — log the real error server-side.
    getLogger().child({ module: "age-gate", },).error(
      "GET /api/age-gate/status failed",
      error instanceof Error ? error : undefined,
    );
    return jsonError("An error occurred", 500,);
  }
}

/**
 * POST /api/age-gate/accept
 *
 * Accept the age gate. Requires `{ birthDate: "YYYY-MM-DD" }` in the body.
 * Returns 200 on success, 400 for invalid data, 403 if underage.
 * @param opts - Options object containing database, userId, and body.
 * @returns JSON response indicating success or failure.
 */
export async function handleAccept({ database, userId, body, }: HandleAcceptOpts,): Promise<Response> {
  if (!userId) {
    return jsonError("Authentication required", 401,);
  }
  try {
    const input = body as Record<string, unknown>;
    if (typeof input.birthDate !== "string") {
      return jsonError("Missing or invalid birthDate (expected YYYY-MM-DD)", 400,);
    }

    await AgeGateService.acceptAgeGate({
      database,
      config: ageGateConfig.get(),
      userId,
      input: { birthDate: input.birthDate, },
    },);

    return jsonResponse({ ok: true, },);
  } catch (error) {
    if (error instanceof AgeGateService.UnderageError) {
      return jsonError(error.message, 403,);
    }
    if (error instanceof AgeGateService.AgeGateError) {
      return jsonError(error.message, 400,);
    }
    // Never leak DB internals to the client — log the real error server-side.
    getLogger().child({ module: "age-gate", },).error(
      "POST /api/age-gate/accept failed",
      error instanceof Error ? error : undefined,
    );
    return jsonError("An error occurred", 500,);
  }
}

/**
 * GET /api/admin/age-gate
 *
 * Returns the current runtime age gate config (admin-only).
 */
export function handleAdminGetConfig(userRole: string | null | undefined,): Response {
  if (!can(userRole, "admin.settings",)) {
    return jsonError("Forbidden", 403,);
  }

  return jsonResponse(ageGateConfig.get(),);
}

/**
 * PUT /api/admin/age-gate
 *
 * Update the runtime age gate config without a server restart.
 * Only `enabled`, `minimumAge`, and `mode` can be changed at runtime.
 *
 * Body example:
 *   { "enabled": true, "minimumAge": 18, "mode": "self-declaration" }
 */
export function handleAdminUpdateConfig(userRole: string | null | undefined, body: unknown,): Response {
  if (!can(userRole, "admin.settings",)) {
    return jsonError("Forbidden", 403,);
  }

  // Validate the input is a non-null object before casting
  if (typeof body !== "object" || !body) {
    return jsonError("Invalid request body", 400,);
  }

  const input = body as Record<string, unknown>;
  const updated: AgeGateConfig = ageGateConfig.get();

  if (typeof input.enabled === "boolean") {
    updated.enabled = input.enabled;
  }
  if (typeof input.minimumAge === "number") {
    if (input.minimumAge < 1 || input.minimumAge > 150) {
      return jsonError("minimumAge must be between 1 and 150", 400,);
    }
    updated.minimumAge = input.minimumAge;
  }
  if (typeof input.mode === "string") {
    const validModes = [AgeGateMode.None, AgeGateMode.SelfDeclaration, AgeGateMode.Verification,] as const;
    if (!validModes.includes(input.mode as (typeof validModes)[number],)) {
      return jsonError(`mode must be one of: ${validModes.join(", ",)}`, 400,);
    }
    updated.mode = input.mode as AgeGateConfig["mode"];
  }

  ageGateConfig.update(updated,);
  return jsonResponse(ageGateConfig.get(),);
}

export function ageGateRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "age-gate", },)
    .get("/api/age-gate/status", (ctx,) => handleGetStatus(database, (ctx as any).userId,),)
    .post("/api/age-gate/accept", (ctx,) => handleAccept({ database, userId: (ctx as any).userId, body: ctx.body, },),)
    .get("/api/admin/age-gate", (ctx,) => handleAdminGetConfig((ctx as any).userRole,),)
    .put("/api/admin/age-gate", (ctx,) => handleAdminUpdateConfig((ctx as any).userRole, ctx.body,),);
}
