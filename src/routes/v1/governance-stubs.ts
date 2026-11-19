// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Reserved v1 governance surfaces.
 *
 * These routes are planned but not implemented. They answer a truthful 501
 * (flat API error envelope, `code: NOT_IMPLEMENTED`) instead of 404, so a
 * client can distinguish "planned contract" from "wrong URL". Auth still
 * runs first: unauthenticated callers get 401 and non-admins get 403 on the
 * admin-only OpenAPI family. Mounted from `governanceEndpoints()`.
 */
import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, extractAuth, HttpStatus, jsonError, requireUserId, } from "../http-utils";

const TaskIdParams = t.Object({ id: t.String(), },);

const AdminStubResponses = {
  401: ErrorResponse,
  403: ErrorResponse,
  501: ErrorResponse,
};

const UserStubResponses = {
  401: ErrorResponse,
  501: ErrorResponse,
};

/**
 * Truthful 501 for a reserved operation.
 * @param feature
 * @returns a standard flat-envelope NOT_IMPLEMENTED response
 */
function notImplemented(feature: string,): Response {
  return jsonError({
    message: `${feature} is reserved for a future API version.`,
    status: HttpStatus.NotImplemented,
    code: ErrorCode.NotImplemented,
  },);
}

/**
 * Auth guard for admin-only reserved routes.
 * @param ctx
 * @returns a 401/403 response, or undefined when authorized
 */
function requireAdmin(ctx: unknown,): Response | undefined {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const { userRole, } = extractAuth(ctx,);
  if (!can(userRole, "admin.system",)) {
    return jsonError("Admin access required", HttpStatus.Forbidden, ErrorCode.Forbidden,);
  }

  return undefined;
}

/**
 * Auth guard for user-scoped reserved routes.
 * @param ctx
 * @returns a 401 response, or undefined when authenticated
 */
function requireUser(ctx: unknown,): Response | undefined {
  const userId = requireUserId(ctx,);
  return typeof userId === "string" ? undefined : userId;
}

/**
 * Build the reserved v1 governance route plugin.
 * @param prefix - v1 API prefix
 * @returns an Elysia plugin with six 501 route stubs
 */
export function governanceStubRoutes(prefix = "/api/v1",) {
  return new Elysia({ name: "v1-governance-stubs", },)
    .post(
      `${prefix}/openapi/validate`,
      (ctx,) => {
        const denied = requireAdmin(ctx,);
        if (denied) { return denied; }
        return notImplemented("OpenAPI validation",);
      },
      {
        response: AdminStubResponses,
        detail: {
          summary: "Validate an OpenAPI document (reserved)",
          description: "Reserved for the OpenAPI governance surface. Always answers 501 until implemented.",
          tags: ["API Governance", "OpenAPI",],
        },
      },
    )
    .post(
      `${prefix}/openapi/diff`,
      (ctx,) => {
        const denied = requireAdmin(ctx,);
        if (denied) { return denied; }
        return notImplemented("OpenAPI diffing",);
      },
      {
        response: AdminStubResponses,
        detail: {
          summary: "Diff two OpenAPI documents (reserved)",
          description: "Reserved for breaking-change detection. Always answers 501 until implemented.",
          tags: ["API Governance", "OpenAPI",],
        },
      },
    )
    .get(
      `${prefix}/openapi/changelog`,
      (ctx,) => {
        const denied = requireAdmin(ctx,);
        if (denied) { return denied; }
        return notImplemented("OpenAPI changelog",);
      },
      {
        response: AdminStubResponses,
        detail: {
          summary: "List OpenAPI contract changes (reserved)",
          description: "Reserved for the spec changelog endpoint. Always answers 501 until implemented.",
          tags: ["API Governance", "OpenAPI",],
        },
      },
    )
    .get(
      `${prefix}/tasks`,
      (ctx,) => {
        const denied = requireUser(ctx,);
        if (denied) { return denied; }
        return notImplemented("Task listing",);
      },
      {
        response: UserStubResponses,
        detail: {
          summary: "List offload tasks (reserved)",
          description: "Reserved for the offloading/task API. Always answers 501 until implemented.",
          tags: ["API Governance", "Tasks",],
        },
      },
    )
    .get(
      `${prefix}/tasks/:id`,
      (ctx,) => {
        const denied = requireUser(ctx,);
        if (denied) { return denied; }
        return notImplemented("Task detail",);
      },
      {
        params: TaskIdParams,
        response: UserStubResponses,
        detail: {
          summary: "Get an offload task (reserved)",
          description: "Reserved for the offloading/task API. Always answers 501 until implemented.",
          tags: ["API Governance", "Tasks",],
        },
      },
    )
    .post(
      `${prefix}/tasks/:id/cancel`,
      (ctx,) => {
        const denied = requireUser(ctx,);
        if (denied) { return denied; }
        return notImplemented("Task cancellation",);
      },
      {
        params: TaskIdParams,
        response: UserStubResponses,
        detail: {
          summary: "Cancel an offload task (reserved)",
          description: "Reserved for the offloading/task API. Always answers 501 until implemented.",
          tags: ["API Governance", "Tasks",],
        },
      },
    );
}
