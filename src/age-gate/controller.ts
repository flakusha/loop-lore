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

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { AgeGateConfig } from "../config/schema";
import { AgeGateMode, UserRole } from "../db/enums";
import * as AgeGateService from "./service";
import { Elysia } from "elysia";

import { jsonResponse, jsonError } from "../routes/http-utils";

// ── Age Gate Config Singleton ─────────────────────────────────

/**
 * Singleton class for age gate runtime config.
 * Prevents module-level mutable state issues.
 */
class AgeGateConfigStore {
  private config: AgeGateConfig = { enabled: false, minimumAge: 18, mode: "self-declaration" };

  init(config: AgeGateConfig): void {
    this.config = { ...config };
  }

  get(): AgeGateConfig {
    return { ...this.config };
  }

  update(partial: Partial<AgeGateConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}

export const ageGateConfig = new AgeGateConfigStore();

/** Seed the runtime config. Called once during server start. */
export function initAgeGate(config: AgeGateConfig): void {
  ageGateConfig.init(config);
}

/** Read the current (possibly admin-overridden) runtime config. */
export function getRuntimeConfig(): AgeGateConfig {
  return ageGateConfig.get();
}

// ── Options objects ──────────────────────────────────────────

export interface HandleAcceptOpts {
  database: Kysely<DB>;
  userId: string | null;
  body: unknown;
}

// ── Helper function ──────────────────────────────────────────

/** Check if user role has admin privileges. Solo mode user = admin-equivalent. */
function hasAdminAccess(userRole: string | null | undefined): boolean {
  return userRole === "admin" || userRole === UserRole.Solo;
}

// ── Route handlers ───────────────────────────────────────────

/**
 * GET /api/age-gate/status
 *
 * Returns whether the age gate is enabled and whether the current
 * user has passed it. The caller must have been authenticated by
 * middleware, with `userId` set on the request context.
 */
export async function handleGetStatus(database: Kysely<DB>, userId?: string | null): Promise<Response> {
  try {
    let user: { birth_date: string | null; age_gate_accepted_at: string | null } | undefined;

    if (userId) {
      user = await database
        .selectFrom("users")
        .select(["birth_date", "age_gate_accepted_at"])
        .where("id", "=", userId)
        .executeTakeFirst();
    }

    const status = AgeGateService.getStatus(ageGateConfig.get(), user ?? null);
    return jsonResponse(status);
  } catch (error) {
    return jsonError((error as Error).message, 500);
  }
}

/**
 * POST /api/age-gate/accept
 *
 * Accept the age gate. Requires `{ birthDate: "YYYY-MM-DD" }` in the body.
 * Returns 200 on success, 400 for invalid data, 403 if underage.
 */
export async function handleAccept({ database, userId, body }: HandleAcceptOpts): Promise<Response> {
  if (!userId) {
    return jsonError("Authentication required", 401);
  }
  try {
    const input = body as Record<string, unknown>;
    if (typeof input.birthDate !== "string") {
      return jsonError("Missing or invalid birthDate (expected YYYY-MM-DD)", 400);
    }

    await AgeGateService.acceptAgeGate({
      database,
      config: ageGateConfig.get(),
      userId,
      input: { birthDate: input.birthDate },
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof AgeGateService.UnderageError) {
      return jsonError(error.message, 403);
    }
    if (error instanceof AgeGateService.AgeGateError) {
      return jsonError(error.message, 400);
    }
    return jsonError((error as Error).message, 500);
  }
}

/**
 * GET /api/admin/age-gate
 *
 * Returns the current runtime age gate config (admin-only).
 */
export function handleAdminGetConfig(userRole: string | null | undefined): Response {
  if (!hasAdminAccess(userRole)) {
    return jsonError("Forbidden", 403);
  }

  return jsonResponse(ageGateConfig.get());
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
export function handleAdminUpdateConfig(userRole: string | null | undefined, body: unknown): Response {
  if (!hasAdminAccess(userRole)) {
    return jsonError("Forbidden", 403);
  }

  // Validate the input is a non-null object before casting
  if (typeof body !== "object" || !body) {
    return jsonError("Invalid request body", 400);
  }

  const input = body as Record<string, unknown>;
  const updated: AgeGateConfig = ageGateConfig.get();

  if (typeof input.enabled === "boolean") {
    updated.enabled = input.enabled;
  }
  if (typeof input.minimumAge === "number") {
    if (input.minimumAge < 1 || input.minimumAge > 150) {
      return jsonError("minimumAge must be between 1 and 150", 400);
    }
    updated.minimumAge = input.minimumAge;
  }
  if (typeof input.mode === "string") {
    const validModes = [AgeGateMode.None, AgeGateMode.SelfDeclaration, AgeGateMode.Verification] as const;
    if (!validModes.includes(input.mode as (typeof validModes)[number])) {
      return jsonError(`mode must be one of: ${validModes.join(", ")}`, 400);
    }
    updated.mode = input.mode as AgeGateConfig["mode"];
  }

  ageGateConfig.update(updated);
  return jsonResponse(ageGateConfig.get());
}

export function ageGateRoutes({ database }: { database: Kysely<DB> }) {
  return new Elysia({ name: "age-gate" })
    .get("/api/age-gate/status", (ctx) => handleGetStatus(database, (ctx as any).userId))
    .post("/api/age-gate/accept", (ctx) =>
      handleAccept({ database, userId: (ctx as any).userId, body: ctx.body }),
    )
    .get("/api/admin/age-gate", (ctx) => handleAdminGetConfig((ctx as any).userRole))
    .put("/api/admin/age-gate", (ctx) => handleAdminUpdateConfig((ctx as any).userRole, ctx.body));
}
