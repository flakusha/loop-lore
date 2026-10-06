// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Config Menu Routes
 *
 * GET  /api/config-menu  — role-filtered config catalog
 * PATCH /api/config-menu — write a config value (admin: system_config, user: settings)
 *
 * Auth: any authenticated user. Role-gating is per-field via the catalog.
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { setConfig, } from "../admin/config";
import { buildConfigMenu, type ConfigMenuField, type ConfigMenuSection, } from "../config/sections/menu";
import type { DB, } from "../db/schema";
import { can, } from "../users/permissions";
import { jsonParseOr, safeJsonStringify, } from "../utils";
import { SettingsUpdateAllowedKeys, } from "../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, requireUserId, } from "./http-utils";

interface ConfigMenuOpts {
  database: Kysely<DB>;
}

/** Minimal Elysia context shape consumed by config-menu routes. */
interface ConfigMenuCtx {
  userId?: string | null;
  userRole?: string | null;
  body?: unknown;
}

function findField(sections: ConfigMenuSection[], key: string,): ConfigMenuField | undefined {
  for (const s of sections) {
    const f = s.fields.find((fld,) => fld.key === key);
    if (f) { return f; }
  }

  return undefined;
}

function coerceValue(raw: unknown, type: ConfigMenuField["type"],): string {
  if (type === "boolean") { return raw === true || raw === "true" || raw === "1" ? "true" : "false"; }
  if (type === "number") { return String(Number(raw,),); }
  if (type === "array" || type === "object") {
    if (typeof raw === "string") { return raw; }
    const serialized = safeJsonStringify(raw,);
    return serialized.ok ? serialized.value : String(raw ?? "",);
  }

  return String(raw ?? "",);
}

export function configMenuRoutes({ database, }: ConfigMenuOpts,) {
  return new Elysia({ name: "config-menu", },)
    .get("/api/config-menu", async (ctx: ConfigMenuCtx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const isAdmin = can(ctx.userRole, "admin.system",);
      const sections = buildConfigMenu(isAdmin,);
      return jsonResponse({ role: isAdmin ? "admin" : "user", sections, },);
    }, {
      response: {
        200: t.Object({
          role: t.Union([t.Literal("admin",), t.Literal("user",),],),
          sections: t.Array(t.Object({
            key: t.String(),
            title: t.String(),
            description: t.Optional(t.String(),),
            group: t.Optional(t.String(),),
            scope: t.Union([t.Literal("admin",), t.Literal("user",),],),
            fields: t.Array(t.Object({
              key: t.String(),
              path: t.Optional(t.String(),),
              label: t.String(),
              type: t.String(),
              description: t.Optional(t.String(),),
              default: t.Optional(t.Unknown(),),
              required: t.Boolean(),
              secret: t.Boolean(),
              restart: t.Boolean(),
              perChat: t.Boolean(),
              editable: t.Boolean(),
              scope: t.String(),
              options: t.Optional(t.Array(t.String(),),),
            },),),
          },),),
        },),
      },
    },)
    .patch(
      "/api/config-menu",
      async (ctx: ConfigMenuCtx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const isAdmin = can(ctx.userRole, "admin.system",);
        const body = ctx.body as { key?: unknown; value?: unknown } | undefined;
        const key = typeof body?.key === "string" ? body.key : "";
        if (!key) { return jsonError("key is required", HttpStatus.BadRequest, ErrorCode.BadRequest,); }

        const adminSections = buildConfigMenu(true,);
        const userSections = buildConfigMenu(false,);
        const field = findField(adminSections, key,) ?? findField(userSections, key,);
        if (!field) { return jsonError(`Unknown config key: ${key}`, HttpStatus.BadRequest, ErrorCode.BadRequest,); }

        if (field.scope === "admin" && !isAdmin) {
          return jsonError("Forbidden", HttpStatus.Forbidden, ErrorCode.Forbidden,);
        }

        if (!field.editable) {
          return jsonError(`Config key is not editable: ${key}`, HttpStatus.BadRequest, ErrorCode.BadRequest,);
        }

        const coerced = coerceValue(body?.value, field.type,);

        if (field.scope === "admin") {
          await setConfig(database, key, coerced, field.description,);
        } else {
          if (!(SettingsUpdateAllowedKeys as readonly string[]).includes(key,)) {
            return jsonError(`Unknown settings key: ${key}`, HttpStatus.BadRequest, ErrorCode.BadRequest,);
          }

          const user = await database.selectFrom("users",).select("settings",).where("id", "=", userId,)
            .executeTakeFirst();

          const current = user?.settings ? jsonParseOr(user.settings, {},) : {};
          const merged = { ...current, [key]: body?.value, };
          const result = safeJsonStringify(merged,);
          if (!result.ok) { return jsonError("Invalid settings data", HttpStatus.BadRequest, ErrorCode.BadRequest,); }
          await database.updateTable("users",).set({ settings: result.value, },).where("id", "=", userId,).execute();
        }

        return jsonResponse({ ok: true, key, },);
      },
      {
        body: t.Object({ key: t.String(), value: t.Unknown(), },),
        response: {
          200: t.Object({ ok: t.Boolean(), key: t.String(), },),
          400: t.Object({ error: t.String(), code: t.String(), },),
          403: t.Object({ error: t.String(), code: t.String(), },),
        },
      },
    );
}
