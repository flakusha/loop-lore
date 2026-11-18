// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI setup routes — operator-entered ComfyUI instances.
 *
 *   POST   /api/admin/sd-status/comfyui/setup       — probe-gate + persist
 *   DELETE /api/admin/sd-status/comfyui/setup/:name — remove a stored setup
 *
 * Mirrors the sd.cpp setup route: operator input is validated before anything
 * is stored, the save is gated on a live `/system_stats` reachability probe of
 * the target (502 with the structured reason when the instance cannot be
 * probed — nothing is stored), and responses never carry key material.
 */

import type { Static, } from "@sinclair/typebox";
import { Elysia, t, } from "elysia";
import {
  DEFAULT_COMFYUI_PROBE_TIMEOUT_MS,
  probeComfyUI,
} from "../../generation/image-engine/comfyui-discovery";
import {
  deleteComfyUISetup,
  saveComfyUISetup,
  SdSetupValidationError,
} from "../../generation/image-engine/comfyui-setup";
import { sdServerAuthHeaders, } from "../../generation/image-engine/sd-server-jobs";
import {
  AdminComfyUISetupBody,
  AdminComfyUISetupResponse,
  AdminSdSetupNameParams,
  ErrorResponse,
} from "../../validation/schemas";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonNoContent,
  jsonResponse,
  requirePermissionUserId,
  withPermissionAuth,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Map a rejected setup payload onto its 400.
 * @param error - the thrown error
 * @returns the 400 response, or undefined when the error is not ours
 */
function validationRejection(error: unknown,): Response | undefined {
  if (!(error instanceof SdSetupValidationError)) { return undefined; }
  return jsonError({
    message: error.message,
    status: HttpStatus.BadRequest,
    code: ErrorCode.ValidationError,
  },);
}

/**
 * @param opts - admin route options (config snapshot + database)
 * @param prefix - route prefix
 * @returns Elysia plugin with the ComfyUI setup endpoints
 */
export function comfyUISetupRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-comfyui-setup", },)
      // Schema violations are operator input errors, not protocol errors —
      // answer them with the same 400 the semantic validation returns.
      .onError(({ code, },) => {
        if (code !== "VALIDATION") { return undefined; }
        return jsonError({
          message: "Invalid ComfyUI setup payload",
          status: HttpStatus.BadRequest,
          code: ErrorCode.ValidationError,
        },);
      },)
      // -- Probe-gate + persist a ComfyUI instance ------------
      .post(`${prefix}/admin/sd-status/comfyui/setup`, async (ctx: any,) => {
        return withPermissionAuth(ctx, "admin.system", async () => {
          const body = ctx.body as Static<typeof AdminComfyUISetupBody>;

          // Probe-gate: the target must answer its native /system_stats
          // endpoint BEFORE anything is stored — validate host/params before save.
          const probe = await probeComfyUI({
            baseUrl: body.baseUrl,
            timeoutMs: DEFAULT_COMFYUI_PROBE_TIMEOUT_MS,
            ...(body.apiKey ? { headers: sdServerAuthHeaders(body.apiKey,), } : {}),
          },);

          if (!probe.reachable) {
            return jsonError({
              message: `ComfyUI instance not usable at ${body.baseUrl} — ${probe.reason}: ${probe.detail}`,
              status: HttpStatus.BadGateway,
              code: ErrorCode.BadGateway,
            },);
          }

          try {
            const provider = await saveComfyUISetup(opts.database, {
              name: body.name,
              baseUrl: body.baseUrl,
              ...(body.label !== undefined ? { label: body.label, } : {}),
              ...(body.purpose !== undefined ? { purpose: body.purpose, } : {}),
              ...(body.workflow !== undefined ? { workflow: body.workflow, } : {}),
              ...(body.defaults !== undefined ? { defaults: body.defaults, } : {}),
              ...(body.apiKey !== undefined ? { apiKey: body.apiKey, } : {}),
            },);

            return jsonResponse({ ok: true, provider, generationLive: true, },);
          } catch (error) {
            const rejection = validationRejection(error,);
            if (rejection) { return rejection; }
            throw error;
          }
        },);
      }, {
        detail: {
          summary: "Create or update a ComfyUI instance",
          description: "Probes the target's native /system_stats endpoint first — an instance that cannot " +
            "be probed is rejected with 502 and the structured reason, and nothing is stored. The API key " +
            "(Bearer credential for reverse-proxy-fronted engines) is stored sealed; omitting it on an " +
            "update keeps the previously stored key, passing an empty apiKey clears it. The saved instance " +
            "joins the generation failover candidates immediately; the assistant /image ComfyUI-first " +
            "routing (imageRouting.comfyUiFirst) orders it ahead of the chain when enabled.",
          tags: ["Admin", "Providers",],
        },
        body: AdminComfyUISetupBody,
        response: {
          200: AdminComfyUISetupResponse,
          400: ErrorResponse,
          403: ErrorResponse,
          502: ErrorResponse,
        },
      },)
      // -- Delete a stored ComfyUI setup ----------------------
      .delete(`${prefix}/admin/sd-status/comfyui/setup/:name`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const name = ctx.params.name as string;
        try {
          await deleteComfyUISetup(opts.database, name,);
        } catch (error) {
          const rejection = validationRejection(error,);
          if (rejection) { return rejection; }
          throw error;
        }

        return jsonNoContent();
      }, {
        params: AdminSdSetupNameParams,
        detail: {
          summary: "Delete a ComfyUI instance",
          description: "Removes the stored setup descriptor and its sealed API key.",
          tags: ["Admin", "Providers",],
        },
        response: {
          204: t.Void(),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },)
  );
}
