// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import {
  deleteServerProvider,
  listServerProviders,
  saveServerProvider,
  ServerProviderMaterializationError,
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
 * Map a provider that could not be materialized onto its 502.
 *
 * The payload was accepted — the instance itself could not be brought up, so
 * this is not an operator input error (400) but a failed materialization.
 * @param error - the thrown error
 * @returns the 502 response, or undefined when the error is not ours
 */
function materializationRejection(error: unknown,): Response | undefined {
  if (!(error instanceof ServerProviderMaterializationError)) { return undefined; }
  return jsonError({
    message: error.message,
    status: HttpStatus.BadGateway,
    code: ErrorCode.BadGateway,
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
        detail: {
          summary: "List stored provider instances",
          description: "Returns the operator-entered provider instances persisted in system_config. " +
            "Never carries key material — each entry reports whether a sealed API key is stored, whether the instance is live " +
            "and, when it is not live, the real reason it could not be materialized.",
          tags: ["Admin", "Providers",],
        },
        response: {
          200: AdminSetupProvidersResponse,
          403: ErrorResponse,
        },
      },)
      // -- Create or update a provider instance ----------------
      .post(`${prefix}/admin/setup/providers`, async (ctx: any,) => {
        return withPermissionAuth(ctx, "admin.system", async (userId,) => {
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
              actor: userId,
            },);

            return jsonResponse({ ok: true, provider, },);
          } catch (error) {
            const rejection = validationRejection(error,) ?? materializationRejection(error,);
            if (rejection) { return rejection; }
            throw error;
          }
        },);
      }, {
        detail: {
          summary: "Create or update a provider instance",
          description: "Persists an operator-entered provider instance and makes it live in the provider " +
            "registry without a restart. The API key is stored sealed; omitting it on an update " +
            "keeps the previously stored key, passing an empty apiKey clears it. " +
            "400 when the payload is rejected — an invalid name, base URL, host approval, or a name " +
            "another provider already owns. 502 when the payload was accepted but the provider " +
            "instance could not be materialized: the response carries the real reason and nothing " +
            "is stored, so the instance is not live.",
          tags: ["Admin", "Providers",],
        },
        body: AdminSetupProviderBody,
        response: {
          200: AdminSetupProviderResponse,
          400: ErrorResponse,
          403: ErrorResponse,
          502: ErrorResponse,
        },
      },)
      // -- Delete a provider instance --------------------------
      .delete(`${prefix}/admin/setup/providers/:name`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const name = ctx.params.name as string;
        try {
          // The store prunes the config-file instance too — the route cannot
          // forget it.
          await deleteServerProvider(opts.database, {
            name,
            config: opts.config,
            actor: userId,
          },);
        } catch (error) {
          const rejection = validationRejection(error,);
          if (rejection) { return rejection; }
          throw error;
        }

        return jsonNoContent();
      }, {
        detail: {
          summary: "Delete a provider instance",
          description: "Removes a stored provider instance and its sealed API key, and unregisters it " +
            "from the provider registry.",
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
