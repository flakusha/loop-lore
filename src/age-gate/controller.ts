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

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { getConfigValue, setConfig, } from "../admin/config";
import type { AgeGateConfig, } from "../config/schema";
import { AgeGateSection, } from "../config/sections/age-gate";
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
  // Seed from the config-section defaults — the single place the default-off
  // (`enabled: false`) is defined (BUG-two-gates-age-gate-keys).
  private config: AgeGateConfig = new AgeGateSection();

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

const AGE_GATE_ENABLED_KEY = "ageGate.enabled";
const AGE_GATE_MIN_AGE_KEY = "ageGate.minimumAge";
const AGE_GATE_MODE_KEY = "ageGate.mode";
const AGE_GATE_MODES: readonly AgeGateMode[] = [
  AgeGateMode.None,
  AgeGateMode.SelfDeclaration,
  AgeGateMode.Verification,
];

/**
 * Overlay persisted admin overrides onto the runtime store. Mirrors
 * applyStoredNsfwConfig: called after the DB is available so a toggle saved
 * through the admin API survives a restart (RA-13).
 * @param db
 * @returns {Promise<void>}
 */
export async function applyStoredAgeGateConfig(db: Kysely<DB>,): Promise<void> {
  const patch: Partial<AgeGateConfig> = {};

  const enabledRaw = await getConfigValue(db, AGE_GATE_ENABLED_KEY,);
  if (enabledRaw === "true") { patch.enabled = true; }
  else if (enabledRaw === "false") { patch.enabled = false; }

  const minAgeRaw = await getConfigValue(db, AGE_GATE_MIN_AGE_KEY,);
  if (minAgeRaw !== undefined) {
    const parsed = Number(minAgeRaw,);
    if (Number.isFinite(parsed,) && parsed >= 1 && parsed <= 150) { patch.minimumAge = parsed; }
  }

  const modeRaw = await getConfigValue(db, AGE_GATE_MODE_KEY,);
  if (modeRaw !== undefined && AGE_GATE_MODES.includes(modeRaw as AgeGateMode,)) {
    patch.mode = modeRaw as AgeGateConfig["mode"];
  }

  if (Object.keys(patch,).length > 0) { ageGateConfig.update(patch,); }
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
 * @param opts.database - Database instance.
 * @param opts.userId - User ID from auth middleware.
 * @param opts.body - Request body.
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
 * @param userRole - User's role from auth middleware.
 * @returns JSON response with current config.
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
 * @param userRole - User's role from auth middleware.
 * @param body - Request body with config updates.
 * @returns JSON response with updated config.
 */
export async function handleAdminUpdateConfig(
  database: Kysely<DB>,
  userRole: string | null | undefined,
  body: unknown,
): Promise<Response> {
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

  // Persist the override beside the runtime update — the NSFW twin survives
  // restarts because it writes system_config; this gate must do the same.
  if (typeof input.enabled === "boolean") {
    await setConfig(database, AGE_GATE_ENABLED_KEY, String(input.enabled,), "Age gate enabled",);
  }

  if (typeof input.minimumAge === "number") {
    await setConfig(database, AGE_GATE_MIN_AGE_KEY, String(updated.minimumAge,), "Age gate minimum age",);
  }

  if (typeof input.mode === "string") {
    await setConfig(database, AGE_GATE_MODE_KEY, updated.mode, "Age gate mode",);
  }

  ageGateConfig.update(updated,);
  return jsonResponse(ageGateConfig.get(),);
}

/**
 * Create the age-gate Elysia route group.
 * @param root0 - Options object.
 * @param root0.database - Database instance.
 * @param prefix - URL prefix for the route group (default `/api`).
 * @returns Configured Elysia app.
 */
export function ageGateRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "age-gate", },)
    .get(`${prefix}/age-gate/status`, (ctx,) => handleGetStatus(database, (ctx as any).userId,),)
    .post(
      `${prefix}/age-gate/accept`,
      (ctx,) => handleAccept({ database, userId: (ctx as any).userId, body: ctx.body, },),
      { body: t.Object({ birthDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$", },), },), },
    )
    .get(`${prefix}/admin/age-gate`, (ctx,) => handleAdminGetConfig((ctx as any).userRole,),)
    .put(
      `${prefix}/admin/age-gate`,
      async (ctx,) => handleAdminUpdateConfig(database, (ctx as any).userRole, ctx.body,),
    );
}
