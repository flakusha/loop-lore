// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * sd.cpp setup routes — operator-entered sd.cpp instances.
 *
 *   POST   /api/admin/sd-status/sdcpp/setup       — probe-gate + persist
 *   DELETE /api/admin/sd-status/sdcpp/setup/:name — remove a stored setup
 *
 * Mirrors the setup-providers route: operator input is validated before
 * anything is stored, the save is gated on a live reachability probe of the
 * target (502 with the structured reason when the instance cannot be probed —
 * nothing is stored), and responses never carry key material.
 */

import type { Static, } from "@sinclair/typebox";
import { Elysia, t, } from "elysia";
import { sdServerAuthHeaders, } from "../../generation/image-engine/sd-server-jobs";
import {
  DEFAULT_SDCPP_PROBE_TIMEOUT_MS,
  probeSdCpp,
} from "../../generation/image-engine/sdcpp-discovery";
import {
  deleteSdCppSetup,
  saveSdCppSetup,
  SdCppSetupValidationError,
} from "../../generation/image-engine/sdcpp-setup";
import {
  AdminSdCppSetupBody,
  AdminSdCppSetupResponse,
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
  if (!(error instanceof SdCppSetupValidationError)) { return undefined; }
  return jsonError({
    message: error.message,
    status: HttpStatus.BadRequest,
    code: ErrorCode.ValidationError,
  },);
}

/**
 * @param opts
 * @param prefix
 * @returns Elysia plugin with the sd.cpp setup endpoints.
 */
export function sdCppSetupRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-sdcpp-setup", },)
      // Schema violations are operator input errors, not protocol errors —
      // answer them with the same 400 the semantic validation returns.
      .onError(({ code, },) => {
        if (code !== "VALIDATION") { return undefined; }
        return jsonError({
          message: "Invalid sd.cpp setup payload",
          status: HttpStatus.BadRequest,
          code: ErrorCode.ValidationError,
        },);
      },)
      // -- Probe-gate + persist an sd.cpp instance ------------
      .post(`${prefix}/admin/sd-status/sdcpp/setup`, async (ctx: any,) => {
        return withPermissionAuth(ctx, "admin.system", async () => {
          const body = ctx.body as Static<typeof AdminSdCppSetupBody>;

          // Probe-gate: the target must answer its native capabilities
          // endpoint BEFORE anything is stored — validate host/params before save.
          const probe = await probeSdCpp({
            baseUrl: body.baseUrl,
            timeoutMs: DEFAULT_SDCPP_PROBE_TIMEOUT_MS,
            ...(body.apiKey ? { headers: sdServerAuthHeaders(body.apiKey,), } : {}),
          },);

          if (!probe.reachable) {
            return jsonError({
              message: `sd.cpp instance not usable at ${body.baseUrl} — ${probe.reason}: ${probe.detail}`,
              status: HttpStatus.BadGateway,
              code: ErrorCode.BadGateway,
            },);
          }

          try {
            const provider = await saveSdCppSetup(opts.database, {
              name: body.name,
              baseUrl: body.baseUrl,
              ...(body.label !== undefined ? { label: body.label, } : {}),
              ...(body.purpose !== undefined ? { purpose: body.purpose, } : {}),
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
          summary: "Create or update an sd.cpp instance",
          description: "Probes the target's native /sdcpp/v1/capabilities endpoint first — an instance " +
            "that cannot be probed is rejected with 502 and the structured reason, and nothing is stored. " +
            "The API key is stored sealed; omitting it on an update keeps the previously stored key, " +
            "passing an empty apiKey clears it. The saved instance joins the generation failover " +
            "candidates immediately; consumers that read only config-file providers (image-edit, " +
            "emotion avatars) do not consult stored setups yet.",
          tags: ["Admin", "Providers",],
        },
        body: AdminSdCppSetupBody,
        response: {
          200: AdminSdCppSetupResponse,
          400: ErrorResponse,
          403: ErrorResponse,
          502: ErrorResponse,
        },
      },)
      // -- Delete a stored sd.cpp setup -----------------------
      .delete(`${prefix}/admin/sd-status/sdcpp/setup/:name`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const name = ctx.params.name as string;
        try {
          await deleteSdCppSetup(opts.database, name,);
        } catch (error) {
          const rejection = validationRejection(error,);
          if (rejection) { return rejection; }
          throw error;
        }

        return jsonNoContent();
      }, {
        params: AdminSdSetupNameParams,
        detail: {
          summary: "Delete an sd.cpp instance",
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
