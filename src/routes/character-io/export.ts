import { Elysia, } from "elysia";
import { exportCharacterSystems, exportCharacterSystemsJson, } from "../../characters/exporters/character-systems";
import type { CharacterSystemsExport, } from "../../characters/exporters/character-systems";
import {
  ActorIdParams,
  CharacterSystemsExportBody,
  ErrorResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import {
  forbiddenResponse as forbidden,
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Export sub-plugin — export character systems data as JSON (GET + filtered POST).
 */
export function exportRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "character-io-export", },)
      // ── Export Systems Data ─────────────────────────────────
      .get(`${prefix}/actors/:actorId/systems/export`, async (ctx: any,) => {
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
      .post(`${prefix}/actors/:actorId/systems/export`, async (ctx: any,) => {
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
  );
}
