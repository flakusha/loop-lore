// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin llama-swap discovery/setup.
 *
 * GET /api/admin/llama-swap/status and PATCH /api/admin/llama-swap/config are
 * also mounted at /api/v1 by adminRoutes.
 *
 * Source of truth for the three writable fields is `LlamaSwapAutoStartConfig`
 * in packages/core/src/config/schema/auto-start.ts (`enabled`, `configPath`,
 * `listenPort`). DB overrides live in `system_config` under the mirrored dot
 * paths below and win over the file-plane `generation.autoStart.llamaSwap`.
 */
import { type Context, Elysia, t, } from "elysia";
import { setConfig, } from "../../admin/config";
import {
  LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY,
  LLAMA_SWAP_AUTOSTART_ENABLED_KEY,
  LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY,
  readEffectiveLlamaSwapConfig,
} from "../../llm/llama-swap-effective-config";
import { readRunningModels, resolveLlamaSwapBase, } from "../../llm/llama-swap-unload";
import { ErrorCode, HttpStatus, jsonError, withPermissionAuth, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** Auth fields populated by the global derive; tests inject the same shape. */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

const patchSchema = t.Object({
  autoStartEnabled: t.Optional(t.Boolean(),),
  listenPort: t.Optional(t.Number(),),
  configPath: t.Optional(t.String(),),
},);

/** Standard 400 body for boundary validation failures. */
function invalid(message: string,): Response {
  return jsonError({ message, status: HttpStatus.BadRequest, code: ErrorCode.BadRequest, },);
}

/**
 * Resolve the honest status view from DB overrides + file config.
 * @param opts Shared admin route options.
 * @returns The exact shape served by GET and returned after PATCH.
 */
async function readStatus(opts: AdminRouteOpts,) {
  const effective = await readEffectiveLlamaSwapConfig(
    opts.database,
    opts.config.generation?.autoStart?.llamaSwap,
  );

  const base = resolveLlamaSwapBase({ listenPort: effective?.listenPort, },);
  const probe = base.trim() === ""
    ? { ok: false, ids: [], }
    : await readRunningModels({ llamaSwapBase: base, timeoutMs: 1_500, },);

  return {
    configured: effective?.configPath !== undefined && effective.configPath !== "",
    autoStartEnabled: effective?.enabled ?? false,
    listenPort: effective?.listenPort ?? null,
    configPath: effective?.configPath || null,
    // `ok` is a real reachability signal from GET /running: an idle proxy still
    // answers ok:true with no ids; an unreachable/malformed proxy answers ok:false.
    running: probe.ok,
  };
}

/**
 * Admin llama-swap discovery/setup routes.
 * @param opts Shared admin route options (database + config).
 * @param prefix Route prefix; the v1 surface passes "/api/v1".
 * @returns The Elysia plugin exposing status GET and config PATCH.
 */
export function llamaSwapRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-llama-swap", },)
      .get(`${prefix}/admin/llama-swap/status`, async (ctx,) => {
        return withPermissionAuth(
          ctx as unknown as Ctx,
          "admin.system",
          async () => Response.json(await readStatus(opts,),),
        );
      },)
      .patch(`${prefix}/admin/llama-swap/config`, async (ctx,) => {
        const body = ctx.body;
        return withPermissionAuth(ctx as unknown as Ctx, "admin.system", async () => {
          if (
            body.listenPort !== undefined &&
            (!Number.isInteger(body.listenPort,) || body.listenPort < 1 || body.listenPort > 65535)
          ) {
            return invalid("listenPort must be an integer between 1 and 65535",);
          }

          if (body.configPath !== undefined && body.configPath.trim() === "") {
            return invalid("configPath must not be empty",);
          }

          if (body.autoStartEnabled !== undefined) {
            await setConfig(
              opts.database,
              LLAMA_SWAP_AUTOSTART_ENABLED_KEY,
              String(body.autoStartEnabled,),
              "Auto-start llama-swap proxy (admin override)",
            );
          }

          if (body.listenPort !== undefined) {
            await setConfig(
              opts.database,
              LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY,
              String(body.listenPort,),
              "llama-swap proxy listen port (admin override)",
            );
          }

          if (body.configPath !== undefined) {
            await setConfig(
              opts.database,
              LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY,
              body.configPath.trim(),
              "llama-swap config YAML path (admin override)",
            );
          }

          return Response.json(await readStatus(opts,),);
        },);
      }, { body: patchSchema, },)
  );
}
