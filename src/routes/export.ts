// src/routes/export.ts
//
// Bulk export routes — export characters, chats, worlds, assets as ZIP archive.
//
// POST /api/export
// Returns a ZIP archive with all requested data.

import { Elysia, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import crypto from "node:crypto";
import { exportToCcV3Json, } from "../characters/exporters/ccv3";
import { exportToYaml, } from "../characters/exporters/yaml";
import type { CanonicalCharacter, } from "../characters/parser";
import type { DB, } from "../db/schema";
import { getOrCreateSoloUserForAuth, } from "../middleware/auth";
import { jsonParseOr, } from "../utils";
import { HttpStatus, jsonError, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

async function resolveUserId(request: Request, database: Kysely<DB>,): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie",);
  const match = cookieHeader ? /ll_token=([^;]+)/.exec(cookieHeader,) : null;
  if (match) {
    const tokenHash = crypto.createHash("sha256",).update(match[1]!,).digest("hex",);
    const session = await database
      .selectFrom("sessions",)
      .select(["user_id",],)
      .where("token_hash", "=", tokenHash,)
      .executeTakeFirst();
    if (session) { return session.user_id; }
  }
  const solo = await getOrCreateSoloUserForAuth(database, "solo",);
  return solo?.id ?? null;
}

export function exportRoutes({ database, }: HandlerOpts,): Elysia {
  return new Elysia({ name: "export", },).onRequest(async (ctx: any,) => {
    const url = new URL(ctx.request.url,);
    if (ctx.request.method === "POST" && url.pathname === "/api/export") {
      const userId = await resolveUserId(ctx.request, database,);
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      let body: Record<string, unknown> = {};
      try {
        body = (await ctx.request.json()) as Record<string, unknown>;
      } catch {
        // Empty body is fine
      }

      const include = (body.include as string[]) ?? ["characters", "chats",];
      const format = (body.format as string) ?? "json";
      const chatIds = body.chat_ids as string[] | undefined;

      const zip = new JSZip();
      const counts: Record<string, number> = {};
      const checksums: Record<string, string> = {};

      function addChecksum(path: string, content: string | Buffer,) {
        checksums[path] = `sha256:${crypto.createHash("sha256",).update(content,).digest("hex",)}`;
      }

      // Export characters
      if (include.includes("characters",)) {
        const characters = await database
          .selectFrom("actors",)
          .select([
            "id",
            "display_name",
            "description",
            "personality",
            "scenario",
            "system_prompt",
            "welcome_message",
            "mes_example",
            "post_history_instructions",
            "creator",
            "creator_notes",
            "character_version",
            "alternate_greetings",
          ],)
          .where("actor_type", "=", "character",)
          .where("user_id", "=", userId,)
          .execute();

        const charsFolder = zip.folder("characters",);
        for (const char of characters) {
          const canonical: CanonicalCharacter = {
            name: char.display_name,
            description: char.description ?? "",
            personality: char.personality ?? undefined,
            scenario: char.scenario ?? undefined,
            welcome_message: char.welcome_message ?? undefined,
            mes_example: char.mes_example ?? undefined,
            system_prompt: char.system_prompt ?? undefined,
            post_history_instructions: char.post_history_instructions ?? undefined,
            creator: char.creator ?? undefined,
            creator_notes: char.creator_notes ?? undefined,
            alternate_greetings: char.alternate_greetings ? jsonParseOr(char.alternate_greetings, [],) : undefined,
          };

          const filename = char.display_name.replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();
          if (format === "yaml") {
            const content = exportToYaml(canonical,);
            charsFolder?.file(`${filename}.yaml`, content,);
            addChecksum(`characters/${filename}.yaml`, content,);
          } else {
            const content = exportToCcV3Json(canonical,);
            charsFolder?.file(`${filename}.json`, content,);
            addChecksum(`characters/${filename}.json`, content,);
          }
        }
        counts.characters = characters.length;
      }

      // Export chats
      if (include.includes("chats",)) {
        let query = database
          .selectFrom("chats",)
          .select(["id", "name", "type", "mode", "created_at",],)
          .where("created_by", "=", userId,);

        if (chatIds && chatIds.length > 0) {
          query = query.where("id", "in", chatIds,);
        }

        const chats = await query.execute();
        const chatsFolder = zip.folder("chats",);

        for (const chat of chats) {
          const messages = await database
            .selectFrom("messages",)
            .innerJoin("actors", "actors.id", "messages.actor_id",)
            .select([
              "messages.id",
              "messages.content",
              "messages.role",
              "messages.created_at",
              "actors.display_name",
            ],)
            .where("messages.chat_id", "=", chat.id,)
            .orderBy("messages.created_at", "asc",)
            .execute();

          const chatData = {
            id: chat.id,
            name: chat.name,
            type: chat.type,
            mode: chat.mode,
            created_at: chat.created_at,
            messages: messages.map((m,) => ({
              id: m.id,
              role: m.role,
              author: m.display_name,
              content: m.content,
              created_at: m.created_at,
            })),
          };

          const filename = (chat.name ?? chat.id).replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();
          const content = JSON.stringify(chatData, null, 2,);
          chatsFolder?.file(`${filename}.json`, content,);
          addChecksum(`chats/${filename}.json`, content,);
        }
        counts.chats = chats.length;
      }

      // Export worlds
      if (include.includes("worlds",)) {
        const worlds = await database
          .selectFrom("worlds",)
          .selectAll()
          .where("owner_id", "=", userId,)
          .execute();

        const worldsFolder = zip.folder("worlds",);
        for (const world of worlds) {
          const content = JSON.stringify(world, null, 2,);
          worldsFolder?.file(`${world.id}.json`, content,);
          addChecksum(`worlds/${world.id}.json`, content,);
        }
        counts.worlds = worlds.length;
      }

      // Export assets
      if (include.includes("assets",)) {
        const assets = await database
          .selectFrom("assets",)
          .selectAll()
          .where("owner_id", "=", userId,)
          .execute();

        const assetsFolder = zip.folder("assets",);
        for (const asset of assets) {
          if (!asset.storage_path) { continue; }
          const file = Bun.file(asset.storage_path,);
          if (!(await file.exists())) { continue; }
          const buffer = await file.arrayBuffer();
          const name = `${asset.id}-${asset.filename}`;
          assetsFolder?.file(name, buffer,);
          addChecksum(`assets/${name}`, Buffer.from(buffer,),);
        }
        counts.assets = assets.length;
      }

      // Build metadata
      const now = new Date();
      const exportInfo = {
        exported_at: now.toISOString(),
        exported_by: userId,
        format,
        includes: include,
        item_count: Object.values(counts,).reduce((a, b,) => a + b, 0,),
      };
      const schemaVersion = {
        schema_version: "1.0",
        export_format_version: "1.0",
      };

      // Add metadata to zip + checksums
      const metadataFolder = zip.folder("metadata",);
      const exportInfoStr = JSON.stringify(exportInfo, null, 2,);
      metadataFolder?.file("export-info.json", exportInfoStr,);
      addChecksum("metadata/export-info.json", exportInfoStr,);

      const schemaVersionStr = JSON.stringify(schemaVersion, null, 2,);
      metadataFolder?.file("schema-version.json", schemaVersionStr,);
      addChecksum("metadata/schema-version.json", schemaVersionStr,);

      // Build manifest (includes checksums from all folders + metadata)
      const manifest = {
        version: "1.0",
        exported_at: now.toISOString(),
        exported_by: userId,
        format_version: "1.0",
        contents: counts,
        checksums,
      };
      const manifestStr = JSON.stringify(manifest, null, 2,);
      zip.file("manifest.json", manifestStr,);
      addChecksum("manifest.json", manifestStr,);

      // Regenerate ZIP with final manifest (checksums updated)
      const finalManifest = {
        version: "1.0",
        exported_at: now.toISOString(),
        exported_by: userId,
        format_version: "1.0",
        contents: counts,
        checksums,
      };
      zip.file("manifest.json", JSON.stringify(finalManifest, null, 2,),);

      // Generate ZIP
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer", },);
      const timestamp = now.toISOString().slice(0, 10,);

      return new Response(new Uint8Array(zipBuffer,), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="loop-lore-export-${timestamp}.zip"`,
        },
      },);
    }
  },) as unknown as Elysia;
}
