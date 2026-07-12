/**
 * Admin Routes
 *
 * Admin-only endpoints:
 *   GET  /api/admin/users          — list all users
 *   GET  /api/admin/users/:id      — get user details
 *   PATCH /api/admin/users/:id/role  — update user role
 *   DELETE /api/admin/users/:id    — delete user (admin only)
 *   GET  /api/admin/stats          — system statistics
 *   GET  /api/admin/providers      — list providers with health status
 *   GET  /api/admin/providers/:name/models — list models for a provider
 *   POST /api/admin/providers/rescan — trigger provider re-scan
 *   GET  /api/admin/model-roles    — get current role assignments
 *   PUT  /api/admin/model-roles/:role — set role override
 *   DELETE /api/admin/model-roles/:role — clear role override
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
import { scanAllProviders, getHealthCache, getProviderHealth, providerToSummary } from "../admin/provider-health";
import {
  VALID_ROLES,
  resolveAllModelRoles,
  setModelRoleOverride,
  clearModelRoleOverride,
  getModelRoleOverrides,
  type ModelRole,
} from "../admin/model-roles";
import { getProvider, listProviders } from "../generation/providers/registry";

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

const dispatch: RouteDispatch = async ({ request, context, database, config }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  // ── /api/admin/providers/rescan ─────────────────────────
  if (pathname === "/api/admin/providers/rescan" && method === "POST") {
    return handleRescanProviders({ context });
  }

  // ── /api/admin/providers/:name/models ───────────────────
  const providerModelsMatch = /^\/api\/admin\/providers\/([^/]+)\/models$/.exec(pathname);
  if (providerModelsMatch && method === "GET") {
    return handleGetProviderModels({ context, providerName: providerModelsMatch[1]! });
  }

  // ── /api/admin/providers ────────────────────────────────
  if (pathname === "/api/admin/providers" && method === "GET") {
    return handleListProviders({ context });
  }

  // ── /api/admin/model-roles/:role (DELETE) ───────────────
  const modelRoleDeleteMatch = /^\/api\/admin\/model-roles\/([a-z]+)$/.exec(pathname);
  if (modelRoleDeleteMatch && method === "DELETE") {
    return handleClearModelRole({ database, context, role: modelRoleDeleteMatch[1]! });
  }

  // ── /api/admin/model-roles/:role (PUT) ──────────────────
  const modelRoleMatch = /^\/api\/admin\/model-roles\/([a-z]+)$/.exec(pathname);
  if (modelRoleMatch && method === "PUT") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleSetModelRole({ database, context, role: modelRoleMatch[1]!, body });
  }

  // ── /api/admin/model-roles ──────────────────────────────
  if (pathname === "/api/admin/model-roles" && method === "GET") {
    return handleGetModelRoles({ database, context, config });
  }

  // ── /api/admin/stats ──────────────────────────────────────
  if (pathname === "/api/admin/stats" && method === "GET") {
    return handleStats({ database, context });
  }

  // ── /api/admin/users/:id/role ─────────────────────────────
  const userRoleMatch = /^\/api\/admin\/users\/([a-f0-9-]+)\/role$/.exec(pathname);
  if (userRoleMatch && method === "PATCH") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleUpdateUserRole({ database, targetId: userRoleMatch[1]!, body, context });
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

// ── Provider endpoints ───────────────────────────────────────

function handleListProviders({ context }: { context: RequestContext }): Response {
  const check = requireAdminRole(context);
  if (check) return check;

  const health = getHealthCache();
  const providers = listProviders().map((p) => {
    const status = health.find((h) => h.name === p.name);
    return {
      name: p.name,
      label: p.capabilities.label,
      capabilities: p.capabilities,
      status: status?.status ?? "unknown",
      modelCount: status?.models.length ?? 0,
      latencyMs: status?.latencyMs,
      lastChecked: status?.lastChecked,
      error: status?.error,
    };
  });

  return jsonResponse({ providers });
}

function handleGetProviderModels({
  context,
  providerName,
}: {
  context: RequestContext;
  providerName: string;
}): Response {
  const check = requireAdminRole(context);
  if (check) return check;

  const provider = getProvider(providerName);
  if (!provider) {
    return jsonError({
      message: "Provider not found",
      status: HttpStatus.NotFound,
      code: ErrorCode.NotFound,
    });
  }

  const health = getProviderHealth(providerName);
  return jsonResponse({
    name: providerName,
    label: provider.capabilities.label,
    models: health?.models ?? [],
    status: health?.status ?? "unknown",
  });
}

async function handleRescanProviders({ context }: { context: RequestContext }): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  const results = await scanAllProviders();
  return jsonResponse({
    providers: results.map((p) => providerToSummary(p)),
  });
}

// ── Model role endpoints ─────────────────────────────────────

async function handleGetModelRoles({
  database,
  context,
  config,
}: {
  database: Kysely<DB>;
  context: RequestContext;
  config: import("../config/schema").Config;
}): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  const resolved = await resolveAllModelRoles(config, database);
  const overrides = await getModelRoleOverrides(database);

  return jsonResponse({
    roles: resolved,
    overrides,
    validRoles: VALID_ROLES,
  });
}

async function handleSetModelRole({
  database,
  context,
  role,
  body,
}: {
  database: Kysely<DB>;
  context: RequestContext;
  role: string;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  if (!VALID_ROLES.includes(role as ModelRole)) {
    return jsonError({
      message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
      status: HttpStatus.BadRequest,
    });
  }

  const provider = body?.provider as string | undefined;
  const model = body?.model as string | undefined;
  if (!provider || !model) {
    return jsonError({ message: "provider and model required", status: HttpStatus.BadRequest });
  }

  try {
    await setModelRoleOverride(role as ModelRole, provider, model, database);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonError({ message: (error as Error).message, status: HttpStatus.BadRequest });
  }
}

async function handleClearModelRole({
  database,
  context,
  role,
}: {
  database: Kysely<DB>;
  context: RequestContext;
  role: string;
}): Promise<Response> {
  const check = requireAdminRole(context);
  if (check) return check;

  if (!VALID_ROLES.includes(role as ModelRole)) {
    return jsonError({
      message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
      status: HttpStatus.BadRequest,
    });
  }

  await clearModelRoleOverride(role as ModelRole, database);
  return jsonNoContent();
}

registerRoute(dispatch);
export { dispatch };
