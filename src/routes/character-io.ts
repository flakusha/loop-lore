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
import { jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function characterIoRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "character-io", },)
    // ── Export ──────────────────────────────────────────────
    .get("/api/actors/:actorId/export", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const worldId = ctx.query.worldId as string | undefined;
      const format = ctx.query.format as string | undefined;

      if (format === "json" || !format) {
        const json = await exportCharacterSystemsJson(database, actorId, worldId,);
        return new Response(json, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="character-${actorId}-systems.json"`,
          },
        },);
      }

      return jsonError({ message: `Unsupported format: ${format}`, status: HttpStatus.BadRequest, },);
    },)
    // ── Export (POST for complex queries) ───────────────────
    .post("/api/actors/:actorId/export", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      const worldId = body.worldId as string | undefined;
      const includeTraits = body.includeTraits as boolean ?? true;
      const includeMood = body.includeMood as boolean ?? true;
      const includeRelationships = body.includeRelationships as boolean ?? true;
      const includeAvatars = body.includeAvatars as boolean ?? true;
      const includeLicensing = body.includeLicensing as boolean ?? true;
      const includeAvailability = body.includeAvailability as boolean ?? true;

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
    },)
    // ── Import ──────────────────────────────────────────────
    .post("/api/actors/:actorId/import", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as CharacterSystemsExport;

      if (!body?.version) {
        return jsonError({ message: "Invalid import data: missing version", status: HttpStatus.BadRequest, },);
      }

      const worldId = body.characterId === actorId ? undefined : undefined; // Use export's worldId if different

      const result = await importCharacterSystems(database, actorId, body, worldId,);

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
    },)
    // ── Import from URL ─────────────────────────────────────
    .post("/api/actors/:actorId/import/url", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      const url = body.url as string | undefined;
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
        hostname === "169.254.169.254" ||
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
    },);
}
