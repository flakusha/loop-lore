/**
 * Character IO Routes
 *
 * API endpoints for importing/exporting character systems data.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { exportCharacterSystems, exportCharacterSystemsJson, } from "../characters/exporters/character-systems";
import type { CharacterSystemsExport, } from "../characters/exporters/character-systems";
import { importCharacterSystems, } from "../characters/importers/character-systems";
import type { DB, } from "../db/schema";
import {
  ActorIdParams,
  CharacterSystemsExportBody,
  CharacterSystemsImportUrlBody,
  ErrorResponse,
  SuccessResponse,
} from "../validation/schemas";
import { forbiddenResponse as forbidden, jsonCreated, jsonError, jsonResponse, requireUserId, } from "./http-utils";
import { HttpStatus, } from "./http-utils";
import { checkActorOwnership, } from "./actor-auth";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function characterIoRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "character-io", },)
    // ── Export Systems Data ─────────────────────────────────
    .get("/api/actors/:actorId/systems/export", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params;
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
      }
      const worldId = ctx.query.worldId as string | undefined;
      const format = ctx.query.format as string | undefined;

      if (format === "json" || !format) {
        const json = await exportCharacterSystemsJson(database, actorId, worldId,);
        return new Response(json, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="character-${String(actorId,)}-systems.json"`,
          },
        },);
      }

      return jsonError({ message: `Unsupported format: ${format}`, status: HttpStatus.BadRequest, },);
    }, {
      params: ActorIdParams,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Export character systems data as JSON",
        description:
          "Exports character systems data (traits, mood, relationships, avatars, licensing, availability) as a downloadable JSON file.",
        tags: ["Characters", "Import/Export",],
      },
    },)
    // ── Export Systems Data (POST for complex queries) ──────
    .post("/api/actors/:actorId/systems/export", async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { actorId, } = ctx.params;
      if (!await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,)) {
        return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
      }
      const {
        worldId,
        includeTraits = true,
        includeMood = true,
        includeRelationships = true,
        includeAvatars = true,
        includeLicensing = true,
        includeAvailability = true,
      } = ctx.body;

      const exportData = await exportCharacterSystems(database, actorId, worldId,);

      // Filter based on options
      const filtered: CharacterSystemsExport = {
        ...exportData,
        traits: includeTraits ? exportData.traits : undefined,
        mood: includeMood ? exportData.mood : undefined,
        relationships: includeRelationships ? exportData.relationships : undefined,
        avatars: includeAvatars ? exportData.avatars : undefined,
        licensing: includeLicensing ? exportData.licensing : undefined,
        availability: includeAvailability ? exportData.availability : undefined,
      };

      return jsonResponse(filtered,);
    }, {
      params: ActorIdParams,
      body: CharacterSystemsExportBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Export character systems data with filters",
        description:
          "Exports character systems data with fine-grained control over which sections to include via POST body options.",
        tags: ["Characters", "Import/Export",],
      },
    },)
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

      const worldId = ctx.body.characterId === actorId ? undefined : undefined; // Use export's worldId if different

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
          return jsonError({ message: `Failed to fetch URL: ${response.statusText}`, status: HttpStatus.BadRequest, },);
        }

        const data = await response.json() as CharacterSystemsExport;
        const result = await importCharacterSystems(database, actorId, data,);

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
    },);
}
