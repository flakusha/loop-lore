// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI model candidates for the settings/preferences surfaces.
 * GET /api/v1/comfyui/models — discover names and resolve the active selection.
 */
import { isComfyUIModelName, } from "@loop-lore/core/config/schema/providers";
import { type Context, Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../admin/config";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { ComfyUIClient, } from "../generation/providers/comfyui";
import {
  COMFYUI_MODEL_ROLES,
  type ComfyUIModelOverrides,
  discoverComfyUIModels,
  resolveComfyUIModels,
} from "../generation/providers/comfyui-model-discovery";
import { jsonParseOr, } from "../utils";
import {
  ComfyUIModelQuery,
  ComfyUIModelsResponse,
  ErrorResponse,
} from "../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "./http-utils";

interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/** Admin system_config key pattern for a provider-wide model pin. */
export const comfyUIModelConfigKey = (provider: string,): string => `comfyui.models.${provider}`;

/** @param raw - persisted override blob (unknown by design) */
function parseOverrides(raw: unknown,): ComfyUIModelOverrides | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw,)) { return undefined; }
  const entry = raw as Record<string, unknown>;
  const out: ComfyUIModelOverrides = {};
  for (const role of COMFYUI_MODEL_ROLES) {
    const name = entry[role];
    if (typeof name === "string" && isComfyUIModelName(role, name,)) { out[role] = name; }
  }

  if (typeof entry.noVae === "boolean") { out.noVae = entry.noVae; }
  return Object.keys(out,).length > 0 ? out : undefined;
}

/** @param raw - JSON string stored in system_config */
function parseAdminOverride(raw: string | undefined,): ComfyUIModelOverrides | undefined {
  if (!raw) { return undefined; }
  return parseOverrides(jsonParseOr<unknown>(raw, null,),);
}

/**
 * @param opts - config snapshot + database handle
 * @param prefix - route prefix
 * @returns Elysia plugin with the ComfyUI model-discovery endpoint
 */
export function comfyUIModelRoutes(
  opts: { config: Config; database: Kysely<DB> },
  prefix = "/api/v1",
) {
  return new Elysia({ name: "comfyui-models", },).get(
    `${prefix}/comfyui/models`,
    async (ctx,) => {
      const c = ctx as unknown as Ctx;
      const userId = requireUserId(c,);
      if (typeof userId !== "string") { return userId; }

      const kind = ctx.query.kind ?? "video";
      const allProviders = kind === "image"
        ? opts.config.generation.providers.sd ?? []
        : opts.config.generation.providers.video ?? [];

      const wanted = ctx.query.provider;
      const provider = wanted ? allProviders.find((entry,) => entry.name === wanted) : allProviders[0];
      if (!provider) {
        return jsonError(`Unknown ComfyUI ${kind} provider: ${wanted ?? "(none configured)"}`, HttpStatus.NotFound,);
      }

      const client = new ComfyUIClient({
        baseUrl: provider.baseUrl,
        timeout: provider.timeout,
        ...(provider.apiKey ? { apiKey: provider.apiKey, } : {}),
      },);

      const discovered = await discoverComfyUIModels(client,);

      const userRow = await opts.database
        .selectFrom("users",)
        .select("settings",)
        .where("id", "=", userId,)
        .executeTakeFirst();

      const settings = jsonParseOr<{ comfyUiModels?: Record<string, unknown> }>(
        userRow?.settings ?? "{}",
        {},
      );

      const adminRaw = await getConfigValue(opts.database, comfyUIModelConfigKey(provider.name,),);

      const view = resolveComfyUIModels({
        discovered,
        config: (provider as { models?: ComfyUIModelOverrides }).models,
        admin: parseAdminOverride(adminRaw,),
        user: parseOverrides(settings.comfyUiModels?.[provider.name],),
      },);

      return jsonResponse({ provider: provider.name, ...view, },);
    },
    {
      query: ComfyUIModelQuery,
      response: { 200: ComfyUIModelsResponse, 401: ErrorResponse, 404: ErrorResponse, },
    },
  );
}
