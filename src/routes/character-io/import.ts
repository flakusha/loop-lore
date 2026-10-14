// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { CharacterSystemsExport, } from "../../characters/exporters/character-systems";
import { importCharacterSystems, } from "../../characters/importers/character-systems";
import { safeFetch, } from "../../utils";

import { validateFetchUrl, } from "../../utils/url-validation";
import {
  ActorIdParams,
  CharacterSystemsImportUrlBody,
  ErrorResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import {
  forbiddenResponse as forbidden,
  HttpStatus,
  jsonCreated,
  jsonError,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Import sub-plugin — import character systems data from body or remote URL.
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { ":actorId": { ...; }; }; }; } & { ...; }, { ...; }, { ...; }>}
 */
export function importRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, resolveHost, } = opts;

  return (
    new Elysia({ name: "character-io-import", },)
      // ── Import Systems Data ─────────────────────────────────
      .post(`${prefix}/actors/:actorId/systems/import`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;
        if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
          return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
        }

        if (!ctx.body?.version) {
          return jsonError({
            message: ctx.t?.("import.invalidImportData",) ?? "Invalid import data: missing version",
            status: HttpStatus.BadRequest,
          },);
        }

        // Resolve an optional target world so world-scoped traits/mood/
        // relationships can be imported (matches GET/POST export ?worldId=).
        const worldId = ctx.body?.worldId as string | undefined;

        const result = await importCharacterSystems(database, actorId, ctx.body, worldId,);

        return jsonCreated({
          success: result.errors.length === 0,
          imported: {
            traits: result.traitsImported,
            mood: result.moodImported,
            relationships: result.relationshipsImported,
            avatars: result.avatarsImported,
            licensing: result.licensingImported,
            availability: result.availabilityImported,
            worldSetup: result.worldSetupImported,
          },
          errors: result.errors,
        },);
      }, {
        params: ActorIdParams,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "Import character systems data from body",
          description:
            "Imports character systems data from a JSON payload in the request body. Validates version and returns import results.",
          tags: ["Characters", "Import/Export",],
        },
      },)
      // ── Import Systems Data from URL ────────────────────────
      .post(`${prefix}/actors/:actorId/systems/import/url`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;
        if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
          return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
        }

        const url = ctx.body.url;
        if (!url) {
          return jsonError({ message: "url is required", status: HttpStatus.BadRequest, },);
        }

        // SSRF protection: only http(s), and every address the hostname
        // resolves to must be public. Testing the hostname string alone is not
        // enough — a public name can point at 10.x/127.x/169.254.x.
        const urlCheck = await validateFetchUrl(url, { resolve: resolveHost, },);
        if (!urlCheck.ok) {
          return jsonError({
            message: urlCheck.error ?? "URL resolves to a private or restricted address",
            status: HttpStatus.BadRequest,
          },);
        }

        try {
          const fetched = await safeFetch<CharacterSystemsExport>(url, {
            timeout: 5_000,
            handle401: false,
          },);

          if (!fetched.ok) {
            return jsonError({
              message: `Failed to fetch URL: ${fetched.error.message}`,
              status: HttpStatus.BadRequest,
            },);
          }

          const data = fetched.data;
          const worldId = ctx.body?.worldId as string | undefined;
          const result = await importCharacterSystems(database, actorId, data, worldId,);

          return jsonCreated({
            success: result.errors.length === 0,
            imported: {
              traits: result.traitsImported,
              mood: result.moodImported,
              relationships: result.relationshipsImported,
              avatars: result.avatarsImported,
              licensing: result.licensingImported,
              availability: result.availabilityImported,
              worldSetup: result.worldSetupImported,
            },
            errors: result.errors,
          },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError({ message: `Failed to import from URL: ${msg}`, status: HttpStatus.BadRequest, },);
        }
      }, {
        params: ActorIdParams,
        body: CharacterSystemsImportUrlBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "Import character systems data from URL",
          description:
            "Fetches character systems data from a remote URL and imports it. Includes SSRF protection blocking private IPs and non-HTTP protocols.",
          tags: ["Characters", "Import/Export",],
        },
      },)
  );
}
