// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import {
  deleteServerProvider,
  listServerProviders,
  removeServerProviderInstance,
  saveServerProvider,
  ServerProviderValidationError,
} from "../../generation/providers/server-provider-store";
import {
  AdminSetupProviderBody,
  AdminSetupProviderResponse,
  AdminSetupProvidersResponse,
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
 * Map a rejected provider payload onto its 400.
 * @param error - the thrown error
 * @returns the 400 response, or undefined when the error is not ours
 */
function validationRejection(error: unknown,): Response | undefined {
  if (!(error instanceof ServerProviderValidationError)) { return undefined; }
  return jsonError({
    message: error.message,
    status: HttpStatus.BadRequest,
    code: ErrorCode.ValidationError,
  },);
}

/**
 * @param opts
 * @param prefix
 * @returns Elysia plugin with the setup-provider endpoints.
 */
export function setupProvidersRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-setup-providers", },)
      // Schema violations are operator input errors, not protocol errors —
      // answer them with the same 400 the semantic validation returns.
      .onError(({ code, }: any,) => {
        if (code !== "VALIDATION") { return undefined; }
        return jsonError({
          message: "Invalid provider payload",
          status: HttpStatus.BadRequest,
          code: ErrorCode.ValidationError,
        },);
      },)
      // -- Stored provider instances (no secrets) -------------
      .get(`${prefix}/admin/setup/providers`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const providers = await listServerProviders(opts.database,);
        return jsonResponse({ providers, },);
      }, {
        response: {
          200: AdminSetupProvidersResponse,
          403: ErrorResponse,
        },
      },)
      // -- Create or update a provider instance ----------------
      .post(`${prefix}/admin/setup/providers`, async (ctx: any,) => {
        return withPermissionAuth(ctx, "admin.system", async () => {
          const body = ctx.body as {
            name: string;
            label: string;
            baseUrl: string;
            model: string;
            apiKey?: string;
            allowedHosts?: string[];
            setDefault?: boolean;
          };

          try {
            const provider = await saveServerProvider(opts.database, {
              name: body.name,
              label: body.label,
              baseUrl: body.baseUrl,
              model: body.model,
              apiKey: body.apiKey,
              allowedHosts: body.allowedHosts,
              setDefault: body.setDefault,
              config: opts.config,
            },);

            return jsonResponse({ ok: true, provider, },);
          } catch (error) {
            const rejection = validationRejection(error,);
            if (rejection) { return rejection; }
            throw error;
          }
        },);
      }, {
        body: AdminSetupProviderBody,
        response: {
          200: AdminSetupProviderResponse,
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },)
      // -- Delete a provider instance --------------------------
      .delete(`${prefix}/admin/setup/providers/:name`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const name = ctx.params.name as string;
        try {
          await deleteServerProvider(opts.database, name,);
        } catch (error) {
          const rejection = validationRejection(error,);
          if (rejection) { return rejection; }
          throw error;
        }

        removeServerProviderInstance(opts.config, name,);
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
