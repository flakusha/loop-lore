// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { dump as yamlDump, } from "js-yaml";
import {
  decorateConfigEntry,
  deleteConfig,
  getAllConfig,
  importConfigFromText,
  REQUIRES_RESTART_KEYS,
  SECRET_KEY_PATTERN,
  setConfig,
} from "../../admin/config";
import { jsonSchema, } from "../../config/schema-class";
import { can, } from "../../users/permissions";
import {
  AdminSystemConfigBody,
  AdminSystemConfigImportBody,
  ErrorResponse,
  SuccessResponse,
} from "../../validation/schemas";
import {
  ErrorCode,
  extractAuth,
  HttpStatus,
  jsonError,
  jsonNoContent,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";
/**
 * @param opts
 * @param prefix
 * @returns Elysia plugin with system-config endpoints.
 */
export function systemConfigRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-system-config", },)
      // -- Config JSON Schema (single source: section *Meta) --
      .get(`${prefix}/admin/config-schema`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        return jsonResponse({
          ...jsonSchema(),
          requires_restart_keys: Object.keys(REQUIRES_RESTART_KEYS,),
        },);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
        },
      },)
      // -- Export persisted system_config rows (yaml/toml) --
      .get(`${prefix}/admin/system-config/export`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const format = ctx.query?.format === "toml" ? "toml" : "yaml";
        const rows = await getAllConfig(opts.database,);
        const body: Record<string, string> = {};
        for (const row of rows) {
          body[row.key] = SECRET_KEY_PATTERN.test(row.key,) ? "***REDACTED***" : row.value;
        }
        try {
          await opts.database
            .insertInto("log_entries",)
            .values({
              id: crypto.randomUUID(),
              level: 6,
              timestamp: Date.now(),
              time: new Date().toISOString(),
              message: `System config exported as ${format} (${rows.length} keys)`,
              module: "admin-system-config",
              action: "system-config.export",
              event_type: "admin",
              entity_type: "system",
            },)
            .execute();
        } catch {
          // Audit trail is best-effort; export still succeeds.
        }
        const date = new Date().toISOString().slice(0, 10,);
        if (format === "toml") {
          const toml = Bun.TOML.stringify({ system_config: body, },) as string;
          return new Response(toml, {
            headers: {
              "Content-Type": "application/toml",
              "Content-Disposition": `attachment; filename="system-config-${date}.toml"`,
            },
          },);
        }
        const yaml = yamlDump({ system_config: body, }, { lineWidth: -1, noRefs: true, },);
        return new Response(yaml, {
          headers: {
            "Content-Type": "application/yaml",
            "Content-Disposition": `attachment; filename="system-config-${date}.yaml"`,
          },
        },);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
        },
      },)
      // -- System configuration -------------------------------
      .get(`${prefix}/admin/system-config`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const configs = await getAllConfig(opts.database,);
        const decorated = configs.map((c,) => decorateConfigEntry(c,));
        return jsonResponse(decorated,);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
        },
      },)
      .patch(
        `${prefix}/admin/system-config`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { key, value, description, } = ctx.body as { key: string; value: string; description?: string };
          await setConfig(opts.database, key, value, description,);
          return jsonResponse({ ok: true, },);
        },
        { body: AdminSystemConfigBody, response: { 200: SuccessResponse, 403: ErrorResponse, }, },
      )
      // -- Import YAML/TOML config into system_config --
      .post(
        `${prefix}/admin/system-config/import`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { format, content, } = ctx.body as { format: "yaml" | "toml"; content: string };
          try {
            const results = await importConfigFromText(opts.database, content, format,);
            // Audit trail: log only counts and secret-redacted keys, never values.
            try {
              await opts.database
                .insertInto("log_entries",)
                .values({
                  id: crypto.randomUUID(),
                  level: 6,
                  timestamp: Date.now(),
                  time: new Date().toISOString(),
                  message: `System config imported from ${format} (${results.length} keys)`,
                  module: "admin-system-config",
                  action: "system-config.import",
                  event_type: "admin",
                  entity_type: "system",
                },)
                .execute();
            } catch {
              // Audit trail is best-effort; import still succeeds.
            }
            return jsonResponse({
              imported: results.filter((r,) => r.action === "added").length,
              changed: results.filter((r,) => r.action === "changed").length,
              skipped: results.filter((r,) => r.action === "skipped").length,
              conflicts: results.filter((r,) => r.action === "conflict").length,
              results,
            },);
          } catch (error) {
            return jsonError({
              message: `Failed to parse ${format} payload: ${(error as Error).message}`,
              status: HttpStatus.BadRequest,
              code: ErrorCode.ValidationError,
            },);
          }
        },
        { body: AdminSystemConfigImportBody, response: { 200: t.Any(), 400: ErrorResponse, 403: ErrorResponse, }, },
      )
      .delete(`${prefix}/admin/system-config/:key`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const key = ctx.params.key as string;
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
