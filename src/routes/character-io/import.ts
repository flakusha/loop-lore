import { Elysia, } from "elysia";
import type { CharacterSystemsExport, } from "../../characters/exporters/character-systems";
import { importCharacterSystems, } from "../../characters/importers/character-systems";
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
 */
export function importRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "character-io-import", },)
      // ── Import Systems Data ─────────────────────────────────
      .post("/api/actors/:actorId/systems/import", async (ctx: any,) => {
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
      .post("/api/actors/:actorId/systems/import/url", async (ctx: any,) => {
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

        // SSRF protection: validate URL scheme and block private IPs
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(url,);
        } catch {
          return jsonError({ message: "Invalid URL", status: HttpStatus.BadRequest, },);
        }

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return jsonError({ message: "Only http and https URLs are allowed", status: HttpStatus.BadRequest, },);
        }

        // Block private/loopback IPs and cloud metadata endpoints
        const hostname = parsedUrl.hostname;
        if (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "::1" ||
          hostname.startsWith("10.",) ||
          hostname.startsWith("172.",) ||
          hostname.startsWith("192.168.",) ||
          hostname === "169.254.169.254" || // eslint-disable-line sonarjs/no-hardcoded-ip
          hostname.startsWith("169.254.",)
        ) {
          return jsonError({
            message: "URL resolves to a private or restricted address",
            status: HttpStatus.BadRequest,
          },);
        }

        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(5000,), },);
          if (!response.ok) {
            return jsonError({
              message: `Failed to fetch URL: ${response.statusText}`,
              status: HttpStatus.BadRequest,
            },);
          }

          const data = await response.json() as CharacterSystemsExport;
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
