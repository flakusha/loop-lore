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
import * as AgeGateService from "./service";

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function jsonError(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

// ── In-memory runtime config (defaults from schema) ──────────

/**
 * Runtime age gate config, seeded from the static config on startup.
 * Admin can override it via PUT /api/admin/age-gate without a restart.
 *
 * Initialised by initAgeGate() which is called once during server start.
 */
let runtimeConfig: AgeGateConfig = { enabled: false, minimumAge: 18, mode: "self-declaration" };

/** Seed the runtime config. Called once during server start. */
export function initAgeGate(config: AgeGateConfig): void {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
  runtimeConfig = { ...config };
}

/** Read the current (possibly admin-overridden) runtime config. */
export function getRuntimeConfig(): AgeGateConfig {
  return { ...runtimeConfig };
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

    const status = AgeGateService.getStatus(runtimeConfig, user ?? null);
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
export async function handleAccept(database: Kysely<DB>, userId: string, body: unknown): Promise<Response> {
  try {
    const input = body as Record<string, unknown>;
    if (typeof input.birthDate !== "string") {
      return jsonError("Missing or invalid birthDate (expected YYYY-MM-DD)", 400);
    }

    await AgeGateService.acceptAgeGate(database, runtimeConfig, userId, {
      birthDate: input.birthDate,
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
export function handleAdminGetConfig(
  userRole: string | null | undefined,
): Response {
  if (userRole !== "admin") {
    return jsonError("Forbidden", 403);
  }

  return jsonResponse(runtimeConfig);
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
export function handleAdminUpdateConfig(
  userRole: string | null | undefined,
  body: unknown,
): Response {
  if (userRole !== "admin") {
    return jsonError("Forbidden", 403);
  }

  // Validate the input is a non-null object before casting
  if (typeof body !== "object" || !body) {
    return jsonError("Invalid request body", 400);
  }

  const input = body as Record<string, unknown>;
  const updated: AgeGateConfig = { ...runtimeConfig };

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
    const validModes = ["none", "self-declaration", "verification"] as const;
    if (!validModes.includes(input.mode as typeof validModes[number])) {
      return jsonError(`mode must be one of: ${validModes.join(", ")}`, 400);
    }
    updated.mode = input.mode as AgeGateConfig["mode"];
  }

  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
  runtimeConfig = updated;
  return jsonResponse(runtimeConfig);
}

// ── Route dispatch ───────────────────────────────────────────

/**
 * Dispatch age-gate requests. Returns a Response or null if the
 * path doesn't match an age-gate route.
 */
export async function dispatch(
  request: Request,
  database: Kysely<DB>,
  userId: string | null,
  userRole: string | null | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/age-gate/status" && request.method === "GET") {
    return handleGetStatus(database, userId);
  }

  if (pathname === "/api/age-gate/accept" && request.method === "POST") {
    const body = await request.json();
    return handleAccept(database, userId ?? "", body);
  }

  if (pathname === "/api/admin/age-gate" && request.method === "GET") {
    return handleAdminGetConfig(userRole);
  }

  if (pathname === "/api/admin/age-gate" && request.method === "PUT") {
    const body = await request.json();
    return handleAdminUpdateConfig(userRole, body);
  }

  return null; // Not an age-gate route
}