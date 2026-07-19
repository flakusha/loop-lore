// src/routes/export.ts
//
// Bulk export routes — export characters, chats, worlds as ZIP archive.
//
// POST /api/export
// Returns a ZIP archive with all requested data.

import { Elysia } from "elysia";
import JSZip from "jszip";
import type { Kysely } from "kysely";
import crypto from "node:crypto";
import { exportToCcV3Json } from "../characters/exporters/ccv3";
import { exportToYaml } from "../characters/exporters/yaml";
import type { CanonicalCharacter } from "../characters/parser";
import type { DB } from "../db/schema";
import { getOrCreateSoloUserForAuth } from "../middleware/auth";
import { HttpStatus, jsonError } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

async function resolveUserId(request: Request, database: Kysely<DB>): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie");
  const match = cookieHeader ? /ll_token=([^;]+)/.exec(cookieHeader) : null;
  if (match) {
    const tokenHash = crypto.createHash("sha256").update(match[1]!).digest("hex");
    const session = await database
      .selectFrom("sessions")
      .select(["user_id"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();
    if (session) return session.user_id;
  }
  const solo = await getOrCreateSoloUserForAuth(database, "solo");
  return solo?.id ?? null;
}

export function exportRoutes({ database }: HandlerOpts): Elysia {
  return new Elysia({ name: "export" }).onRequest(async (ctx: any) => {
    const url = new URL(ctx.request.url);
    if (ctx.request.method === "POST" && url.pathname === "/api/export") {
      const userId = await resolveUserId(ctx.request, database);
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized });

      let body: Record<string, unknown> = {};
      try {
        body = (await ctx.request.json()) as Record<string, unknown>;
      } catch {
        // Empty body is fine
      }

      const include = (body.include as string[]) ?? ["characters", "chats"];
      const format = (body.format as string) ?? "json";
      const chatIds = body.chat_ids as string[] | undefined;

      const zip = new JSZip();
      const manifest: Record<string, unknown> = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        exported_by: userId,
        format,
        contents: {},
      };

      const counts: Record<string, number> = {};

      // Export characters
      if (include.includes("characters")) {
        const characters = await database
          .selectFrom("actors")
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
          ])
          .where("actor_type", "=", "character")
          .where("user_id", "=", userId)
          .execute();

        const charsFolder = zip.folder("characters");
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
            character_version: char.character_version ?? undefined,
            alternate_greetings: char.alternate_greetings ? JSON.parse(char.alternate_greetings) : undefined,
          };

          const filename = char.display_name.replaceAll(/[^a-z0-9]/gi, "_").toLowerCase();
          if (format === "yaml") {
            charsFolder?.file(`${filename}.yaml`, exportToYaml(canonical));
          } else {
            charsFolder?.file(`${filename}.json`, exportToCcV3Json(canonical));
          }
        }
        counts.characters = characters.length;
      }

      // Export chats
      if (include.includes("chats")) {
        let query = database
          .selectFrom("chats")
          .select(["id", "name", "type", "mode", "created_at"])
          .where("created_by", "=", userId);

        if (chatIds && chatIds.length > 0) {
          query = query.where("id", "in", chatIds);
        }

        const chats = await query.execute();
        const chatsFolder = zip.folder("chats");

        for (const chat of chats) {
          const messages = await database
            .selectFrom("messages")
            .innerJoin("actors", "actors.id", "messages.actor_id")
            .select([
              "messages.id",
              "messages.content",
              "messages.role",
              "messages.created_at",
              "actors.display_name",
            ])
            .where("messages.chat_id", "=", chat.id)
            .orderBy("messages.created_at", "asc")
            .execute();

          const chatData = {
            id: chat.id,
            name: chat.name,
            type: chat.type,
            mode: chat.mode,
            created_at: chat.created_at,
            messages: messages.map((m) => ({
              id: m.id,
              role: m.role,
              author: m.display_name,
              content: m.content,
              created_at: m.created_at,
            })),
          };

          const filename = (chat.name ?? chat.id).replaceAll(/[^a-z0-9]/gi, "_").toLowerCase();
          chatsFolder?.file(`${filename}.json`, JSON.stringify(chatData, null, 2));
        }
        counts.chats = chats.length;
      }

      manifest.contents = counts;

      // Add manifest
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      // Generate ZIP
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const timestamp = new Date().toISOString().slice(0, 10);

      return new Response(new Uint8Array(zipBuffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="loop-lore-export-${timestamp}.zip"`,
        },
      });
    }
  }) as unknown as Elysia;
}
