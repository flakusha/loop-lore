import { Elysia, t, } from "elysia";
import { deleteConfig, getAllConfig, setConfig, } from "../../admin/config";
import { isAdminRole, } from "../../middleware/admin-gate";
import { AdminSystemConfigBody, ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonNoContent, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function systemConfigRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-system-config", },)
      // ── System configuration ───────────────────────────────
      .get(prefix + "/admin/system-config", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const configs = await getAllConfig(opts.database,);
        return jsonResponse(configs,);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
        },
      },)
      .patch(
        prefix + "/admin/system-config",
        async (ctx: any,) => {
          const { userRole, body, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { key, value, description, } = body as { key: string; value: string; description?: string };
          await setConfig(opts.database, key, value, description,);
          return jsonResponse({ ok: true, },);
        },
        { body: AdminSystemConfigBody, response: { 200: SuccessResponse, 403: ErrorResponse, }, },
      )
      .delete(prefix + "/admin/system-config/:key", async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const key = p.key as string;
        await deleteConfig(opts.database, key,);
        return jsonNoContent();
      }, {
        response: {
          204: t.Void(),
          403: ErrorResponse,
        },
      },)
  );
}
