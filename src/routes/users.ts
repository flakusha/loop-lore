/**
 * User Routes
 *
 *   GET  /api/users/me       — current user profile
 *   PUT  /api/users/me       — update own profile
 *   GET  /api/users/:id      — get user by ID (admin or self)
 *   PUT  /api/users/:id      — update user (admin or self)
 *   DELETE /api/users/:id    — delete user (admin only)
 *   PUT  /api/users/:id/settings   — update user settings
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { safeJsonStringify, jsonParseOr } from "../utils";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
  parseBody,
} from "./http-utils";

interface GetMeOpts {
  database: Kysely<DB>;
  context: RequestContext;
}
interface UpdateMeOpts {
  database: Kysely<DB>;
  context: RequestContext;
  body: Record<string, unknown>;
}
interface GetUserOpts {
  database: Kysely<DB>;
  context: RequestContext;
  targetId: string;
}
interface UpdateUserOpts {
  database: Kysely<DB>;
  context: RequestContext;
  targetId: string;
  body: Record<string, unknown>;
}
interface UpdateUserSettingsOpts {
  database: Kysely<DB>;
  context: RequestContext;
  targetId: string;
  body: Record<string, unknown>;
}
interface DeleteUserOpts {
  database: Kysely<DB>;
  context: RequestContext;
  targetId: string;
}

function extractUserId(pathname: string): string | null {
  const match = /^\/api\/users\/([a-f0-9-]+)(\/settings)?$/.exec(pathname);
  return match ? match[1]! : null;
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  // ── /api/users/me ───────────────────────────────────────────
  if (pathname === "/api/users/me" && method === "GET") {
    return handleGetMe({ database, context });
  }
  if (pathname === "/api/users/me" && method === "PUT") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleUpdateMe({ database, body, context });
  }

  // ── /api/users/:id[/settings] ───────────────────────────────
  const userId = extractUserId(pathname);
  const isSettings = pathname.endsWith("/settings");

  if (userId && pathname.startsWith("/api/users/") && userId !== "me") {
    if (method === "GET" && !isSettings) {
      return handleGetUser({ database, targetId: userId, context });
    }
    if (method === "PUT" && !isSettings) {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateUser({ database, targetId: userId, body, context });
    }
    if (method === "PUT" && isSettings) {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateUserSettings({ database, targetId: userId, body, context });
    }
    if (method === "DELETE" && !isSettings) {
      return handleDeleteUser({ database, targetId: userId, context });
    }
    return BAD_METHOD();
  }

  return null; // Not a user route
};

async function handleGetMe({ database, context }: GetMeOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const user = await database
    .selectFrom("users")
    .select(["id", "username", "display_name", "role", "created_at", "last_seen_at"])
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!user)
    return jsonError({ message: "User not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  return jsonResponse(user);
}

async function handleUpdateMe({ database, body, context }: UpdateMeOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const updates: Record<string, unknown> = {};
  if (body.displayName != null) updates.display_name = body.displayName;
  // TODO: re-validate age gate when birthDate changes
  if (body.birthDate != null) updates.birth_date = body.birthDate;
  if (body.settings) {
    const settingsResult = safeJsonStringify(body.settings);
    if (!settingsResult.ok)
      return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });
    updates.settings = settingsResult.value;
  }

  await database.updateTable("users").set(updates).where("id", "=", userId).execute();

  return jsonResponse({ ok: true });
}

async function handleGetUser({ database, targetId, context }: GetUserOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  // Non-admin can only view own profile via /api/users/me
  if (context.userRole !== "admin") {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });
  }

  const user = await database
    .selectFrom("users")
    .select(["id", "username", "display_name", "role", "created_at", "last_seen_at"])
    .where("id", "=", targetId)
    .executeTakeFirst();

  if (!user)
    return jsonError({ message: "User not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  return jsonResponse(user);
}

async function handleUpdateUser({ database, targetId, body, context }: UpdateUserOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  // User can update own profile; admin can update any
  if (targetId !== userId && context.userRole !== "admin") {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });
  }

  const updates: Record<string, unknown> = {};
  if (body.displayName !== undefined) updates.display_name = body.displayName;
  if (body.settings) {
    const settingsResult = safeJsonStringify(body.settings);
    if (!settingsResult.ok)
      return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });
    updates.settings = settingsResult.value;
  }

  // Check target user exists
  const targetUser = await database
    .selectFrom("users")
    .select("id")
    .where("id", "=", targetId)
    .executeTakeFirst();
  if (!targetUser) return jsonError({ message: "User not found", status: HttpStatus.NotFound });

  await database.updateTable("users").set(updates).where("id", "=", targetId).execute();

  return jsonResponse({ ok: true });
}

async function handleUpdateUserSettings({
  database,
  targetId,
  body,
  context,
}: UpdateUserSettingsOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  if (targetId !== userId && context.userRole !== "admin") {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });
  }

  const current = await database
    .selectFrom("users")
    .select("settings")
    .where("id", "=", targetId)
    .executeTakeFirst();

  const currentSettings = current?.settings ? jsonParseOr(current.settings, {}) : {};
  const merged = { ...currentSettings, ...body };

  const mergedResult = safeJsonStringify(merged);
  if (!mergedResult.ok) return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });

  await database
    .updateTable("users")
    .set({ settings: mergedResult.value })
    .where("id", "=", targetId)
    .execute();

  return jsonResponse(merged);
}

async function handleDeleteUser({ database, targetId, context }: DeleteUserOpts): Promise<Response> {
  if (context.userRole !== "admin") {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });
  }

  await database.deleteFrom("users").where("id", "=", targetId).execute();

  return jsonNoContent();
}

registerRoute(dispatch);
export { dispatch };
