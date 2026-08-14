import { Elysia, t, } from "elysia";
import {
  clearModelRoleOverride,
  getModelRoleOverrides,
  type ModelRole,
  resolveAllModelRoles,
  setModelRoleOverride,
  VALID_ROLES,
} from "../../admin/model-roles";
import { isAdminRole, } from "../../middleware/admin-gate";
import {
  AdminModelRoleOverrideBody,
  ErrorResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonNoContent, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function modelRolesRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-model-roles", },)
      // ── Model role overrides ───────────────────────────────
      .get(`${prefix}/admin/model-roles`, async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const resolved = await resolveAllModelRoles(opts.config, opts.database,);
        const overrides = await getModelRoleOverrides(opts.database,);

        return jsonResponse({ roles: resolved, overrides, validRoles: VALID_ROLES, },);
      }, {
        response: {
          200: t.Object({ roles: t.Array(t.Any(),), overrides: t.Array(t.Any(),), validRoles: t.Array(t.String(),), },),
          403: ErrorResponse,
        },
      },)
      .get(`${prefix}/admin/model-roles/:role`, async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const role = p.role as string;
        if (!(VALID_ROLES as readonly string[]).includes(role,)) {
          return jsonError({
            message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ",)}`,
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }

        const resolved = await resolveAllModelRoles(opts.config, opts.database,);
        const roleConfig = resolved.find((r,) => r.role === role) ?? null;
        return jsonResponse({ role, config: roleConfig, },);
      }, {
        response: {
          200: t.Object({ role: t.String(), config: t.Any(), },),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },)
      .put(
        `${prefix}/admin/model-roles/:role`,
        async (ctx: any,) => {
          const { params: p, body, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const role = p.role as string;
          if (!(VALID_ROLES as readonly string[]).includes(role,)) {
            return jsonError({
              message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ",)}`,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }

          const { provider, model, } = body as { provider: string; model: string };

          try {
            await setModelRoleOverride(role as ModelRole, provider, model, opts.database,);
            return jsonResponse({ ok: true, },);
          } catch (error) {
            return jsonError({
              message: (error as Error).message,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }
        },
        {
          body: AdminModelRoleOverrideBody,
          response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, },
        },
      )
      .delete(`${prefix}/admin/model-roles/:role`, async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const role = p.role as string;
        if (!(VALID_ROLES as readonly string[]).includes(role,)) {
          return jsonError({
            message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ",)}`,
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }

        await clearModelRoleOverride(role as ModelRole, opts.database,);
        return jsonNoContent();
      }, {
        response: {
          204: t.Void(),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },)
  );
}
