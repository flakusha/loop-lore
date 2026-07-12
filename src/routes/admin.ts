/**
 * Admin Routes
 *
 * Admin-only endpoints:
 *   GET  /api/admin/users          — list all users
 *   GET  /api/admin/users/:id      — get user details
 *   PATCH /api/admin/users/:id/role  — update user role
 *   DELETE /api/admin/users/:id    — delete user (admin only)
 *   GET  /api/admin/stats          — system statistics
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { UserRole } from "../db/enums-core";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
  parseBody,
  parsePagination,
} from "./http-utils";

interface ListUsersOpts {
  database: Kysely<DB>;
  context: RequestContext;
  page: number;
  pageSize: number;
}
interface AdminUserOpts {
  database: Kysely<DB>;
  context: RequestContext;
  targetId: string;
  body?: Record<string, unknown>;
}

function requireAdminRole(context: RequestContext): Response | null {
  if (context.userRole !== "admin") {
    return jsonError({
      message: "Admin access required",
      status: HttpStatus.Forbidden,
      code: ErrorCode.Forbidden,
    });
  }
  return null;
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  // ── /api/admin/stats ──────────────────────────────────────
  if (pathname === "/api/admin/stats" && method === "GET") {
    return handleStats({ database, context });
  }

  // ── /api/admin/users/:id/role ─────────────────────────────
  const roleMatch = /^\/api\/admin\/users\/([a-f0-9-]+)\/role$/.exec(pathname);
  if (roleMatch && method === "PATCH") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleUpdateUserRole({ database, targetId: roleMatch[1]!, body, context });
  }

  // ── /api/admin/users/:id ──────────────────────────────────
  const userMatch = /^\/api\/admin\/users\/([a-f0-9-]+)$/.exec(pathname);
  if (userMatch) {
    if (method === "GET") {
      return handleGetUser({ database, targetId: userMatch[1]!, context });
    }
    if (method === "DELETE") {
      return handleDeleteUser({ database, targetId: userMatch[1]!, context });
    }
    return BAD_METHOD();
  }

  // ── /api/admin/users (collection) ─────────────────────────
  if (pathname === "/api/admin/users" && method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    return handleListUsers({ database, context, page, pageSize });
  }

  return null;
};

async function handleListUsers({ database, context, page, pageSize }: ListUsersOpts): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  const offset = (page - 1) * pageSize;
  const countResult = await database
    .selectFrom("users")
    .select(database.fn.countAll<number>().as("total"))
    .executeTakeFirst();
  const total = countResult?.total ?? 0;

  const users = await database
    .selectFrom("users")
    .select(["id", "username", "display_name", "role", "status", "created_at", "last_seen_at"])
    .orderBy("created_at", "desc")
    .limit(pageSize)
    .offset(offset)
    .execute();

  return jsonResponse({ data: users, total, page, pageSize });
}

async function handleGetUser({ database, targetId, context }: AdminUserOpts): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  const user = await database
    .selectFrom("users")
    .select([
      "id",
      "username",
      "display_name",
      "role",
      "status",
      "birth_date",
      "settings",
      "created_at",
      "last_seen_at",
    ])
    .where("id", "=", targetId)
    .executeTakeFirst();

  if (!user) {
    return jsonError({ message: "User not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  }
  return jsonResponse(user);
}

async function handleUpdateUserRole({ database, targetId, body, context }: AdminUserOpts): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  const role = body?.role as UserRole | undefined;
  if (!role || !["admin", "user", "viewer"].includes(role)) {
    return jsonError({ message: "Valid role required: admin, user, viewer", status: HttpStatus.BadRequest });
  }

  await database.updateTable("users").set({ role }).where("id", "=", targetId).execute();
  return jsonResponse({ ok: true });
}

async function handleDeleteUser({ database, targetId, context }: AdminUserOpts): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  await database.deleteFrom("users").where("id", "=", targetId).execute();
  return jsonNoContent();
}

async function handleStats({
  database,
  context,
}: {
  database: Kysely<DB>;
  context: RequestContext;
}): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  const [userCount, chatCount, messageCount, characterCount, assetCount] = await Promise.all([
    database.selectFrom("users").select(database.fn.countAll<number>().as("n")).executeTakeFirst(),
    database.selectFrom("chats").select(database.fn.countAll<number>().as("n")).executeTakeFirst(),
    database.selectFrom("messages").select(database.fn.countAll<number>().as("n")).executeTakeFirst(),
    database
      .selectFrom("actors")
      .select(database.fn.countAll<number>().as("n"))
      .where("actor_type", "=", "character")
      .executeTakeFirst(),
    database.selectFrom("assets").select(database.fn.countAll<number>().as("n")).executeTakeFirst(),
  ]);

  return jsonResponse({
    users: userCount?.n ?? 0,
    chats: chatCount?.n ?? 0,
    messages: messageCount?.n ?? 0,
    characters: characterCount?.n ?? 0,
    assets: assetCount?.n ?? 0,
  });
}

registerRoute(dispatch);
export { dispatch };
