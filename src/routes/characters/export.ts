import { Elysia, t, } from "elysia";
import { readFileSync, } from "node:fs";
import { createCharx, } from "../../characters/charx";
import { exportToCcV2Json, } from "../../characters/exporters/ccv2";
import { exportToCcV3Json, } from "../../characters/exporters/ccv3";
import { exportToToml, } from "../../characters/exporters/toml";
import { exportToYaml, } from "../../characters/exporters/yaml";
import type { CanonicalCharacter, } from "../../characters/parser";
import { getMinimalPng, insertCharacterDataIntoPng, } from "../../characters/steganography";
import { jsonParseOr, } from "../../utils";
import {
  ActorIdParams,
  ErrorResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonError, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export function exportRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-export", },)
    .get(prefix + "/actors/:actorId/export", async (ctx: any,) => {
      const format = ctx.query.format ?? "json";

      const actor = await database
        .selectFrom("actors",)
        .selectAll()
        .where("id", "=", ctx.params.actorId,)
        .executeTakeFirst();
      if (!actor) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      // Solo role is admin-equivalent for own actors
      const isAdminOrSolo = ctx.userRole === "admin" || ctx.userRole === "solo";
      if (actor.visibility !== "public" && actor.user_id !== ctx.userId && !isAdminOrSolo) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      // Convert to canonical format
      const canonical: CanonicalCharacter = {
        name: actor.display_name,
        description: actor.description ?? "",
        personality: actor.personality ?? "",
        scenario: actor.scenario ?? undefined,
        welcome_message: actor.welcome_message ?? undefined,
        mes_example: actor.mes_example ?? undefined,
        system_prompt: actor.system_prompt ?? undefined,
        post_history_instructions: actor.post_history_instructions ?? undefined,
        creator: actor.creator ?? undefined,
        creator_notes: actor.creator_notes ?? undefined,
        character_version: actor.character_version ?? undefined,
        alternate_greetings: actor.alternate_greetings
          ? jsonParseOr(actor.alternate_greetings, [],)
          : undefined,
      };

      const safeName = actor.display_name.replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();

      // If stored as YAML/TOML with raw source, return the raw source for fidelity
      const sourceFormat = (actor as Record<string, unknown>).data_source_format as string | undefined;
      const rawSource = (actor as Record<string, unknown>).data_raw as string | undefined;

      if (
        (format === "yaml" || format === "toml") &&
        sourceFormat &&
        sourceFormat === format &&
        rawSource
      ) {
        const contentType = format === "yaml" ? "text/yaml" : "text/plain";
        return new Response(rawSource, {
          headers: {
            "Content-Type": `${contentType}; charset=utf-8`,
            "Content-Disposition": `attachment; filename="${safeName}.${format}"`,
          },
        },);
      }

      switch (format) {
        case "yaml": {
          return new Response(exportToYaml(canonical,), {
            headers: {
              "Content-Type": "text/yaml; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.yaml"`,
            },
          },);
        }
        case "toml": {
          return new Response(exportToToml(canonical,), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.toml"`,
            },
          },);
        }
        case "png": {
          const dataObj: Record<string, unknown> = {
            name: canonical.name,
            description: canonical.description,
            personality: canonical.personality,
            scenario: canonical.scenario,
            first_mes: canonical.welcome_message,
            mes_example: canonical.mes_example,
            system_prompt: canonical.system_prompt,
            post_history_instructions: canonical.post_history_instructions,
            creator_notes: canonical.creator_notes,
            creator: canonical.creator,
            character_version: canonical.character_version,
            alternate_greetings: canonical.alternate_greetings,
            tags: canonical.tags,
          };
          const pngBuf = insertCharacterDataIntoPng(getMinimalPng(), dataObj,);
          return new Response(new Uint8Array(pngBuf,), {
            headers: {
              "Content-Type": "image/png",
              "Content-Disposition": `attachment; filename="${safeName}.png"`,
            },
          },);
        }
        case "charx": {
          const v3Data: Record<string, unknown> = {
            spec: "chara_card_v3",
            data: {
              name: canonical.name,
              description: canonical.description,
              personality: canonical.personality,
              scenario: canonical.scenario,
              first_mes: canonical.welcome_message,
              mes_example: canonical.mes_example,
              system_prompt: canonical.system_prompt,
              post_history_instructions: canonical.post_history_instructions,
              creator_notes: canonical.creator_notes,
              creator: canonical.creator,
              character_version: canonical.character_version,
              alternate_greetings: canonical.alternate_greetings,
              tags: canonical.tags,
            },
          };
          // Fetch linked assets for the character
          const assetRows = await database
            .selectFrom("asset_links",)
            .innerJoin("assets", "assets.id", "asset_links.asset_id",)
            .select(["assets.storage_path", "assets.filename",],)
            .where("asset_links.entity_type", "=", "actor",)
            .where("asset_links.entity_id", "=", ctx.params.actorId,)
            .execute();
          const assets: { path: string; data: Buffer }[] = [];
          for (const a of assetRows) {
            const data = readFileSync(a.storage_path,);
            if (data.length > 0) {
              assets.push({ path: a.filename, data, },);
            }
          }
          const charxBuf = await createCharx(v3Data, assets,);
          return new Response(new Uint8Array(charxBuf,), {
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": `attachment; filename="${safeName}.charx"`,
            },
          },);
        }
        case "ccv2": {
          return new Response(exportToCcV2Json(canonical,), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.json"`,
            },
          },);
        }
        case "ccv3":
        case "json":
        default: {
          return new Response(exportToCcV3Json(canonical,), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.json"`,
            },
          },);
        }
      }
    }, {
      params: ActorIdParams,
      response: {
        200: t.Any(),
        404: ErrorResponse,
      },
    },);
}
