/**
 * Settings Routes
 *
 * Per-user settings CRUD:
 *   GET  /api/settings           — get current user settings
 *   PATCH /api/settings          — update current user settings
 *   GET  /api/settings/export    — bulk export user data (ZIP)
 *
 * Elysia plugin — uses auth guard for authentication (context.userId available).
 */

import { Elysia, t } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { jsonResponse, jsonError, HttpStatus } from "./http-utils";
import { jsonParseOr, safeJsonStringify } from "../utils";
import JSZip from "jszip";
import { ActorType } from "../db/enums";
import { unauthorized } from "../validation/middleware";

async function handleGetSettings(database: Kysely<DB>, userId: string): Promise<Response> {
  const user = await database
    .selectFrom("users")
    .select("settings")
    .where("id", "=", userId)
    .executeTakeFirst();
  const settings = user?.settings ? jsonParseOr(user.settings, {}) : {};
  return jsonResponse(settings);
}

async function handleUpdateSettings(
  database: Kysely<DB>,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const current = await database
    .selectFrom("users")
    .select("settings")
    .where("id", "=", userId)
    .executeTakeFirst();

  const currentSettings = current?.settings ? jsonParseOr(current.settings, {}) : {};
  const merged = { ...currentSettings, ...body };

  const mergedResult = safeJsonStringify(merged);
  if (!mergedResult.ok) {
    return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });
  }

  await database
    .updateTable("users")
    .set({ settings: mergedResult.value })
    .where("id", "=", userId)
    .execute();
  return jsonResponse(merged);
}

async function handleExportAll(database: Kysely<DB>, userId: string): Promise<Response> {
  const user = await database
    .selectFrom("users")
    .select("settings")
    .where("id", "=", userId)
    .executeTakeFirst();
  const settings = user?.settings ? jsonParseOr(user.settings, {}) : {};

  const characters = await database
    .selectFrom("actors")
    .selectAll()
    .where("owner_id", "=", userId)
    .where("actor_type", "=", ActorType.Character)
    .execute();

  const chats = await database.selectFrom("chats").selectAll().where("created_by", "=", userId).execute();

  const assets = await database
    .selectFrom("assets")
    .select(["id", "filename", "mime_type", "asset_type", "size_bytes", "created_at"])
    .where("owner_id", "=", userId)
    .execute();

  const zip = new JSZip();
  const settingsStr = safeJsonStringify(settings);
  const charactersStr = safeJsonStringify(characters);
  const chatsStr = safeJsonStringify(chats);
  const assetsStr = safeJsonStringify(assets);
  zip.file("settings.json", settingsStr.ok ? settingsStr.value : "{}");
  zip.file("characters.json", charactersStr.ok ? charactersStr.value : "[]");
  zip.file("chats.json", chatsStr.ok ? chatsStr.value : "[]");
  zip.file("assets.json", assetsStr.ok ? assetsStr.value : "[]");

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="loop-lore-export.zip"',
    },
  });
}

export function settingsRoutes({ database }: { database: Kysely<DB> }) {
  return new Elysia({ name: "settings" })
    .get("/api/settings", async (ctx) => {
      const userId = (ctx as any).userId as string | null;
      if (!userId) {
        return unauthorized();
      }
      return handleGetSettings(database, userId);
    })
    .patch(
      "/api/settings",
      async (ctx: any) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return unauthorized();
        }
        const body = ctx.body as Record<string, unknown>;
        return handleUpdateSettings(database, userId, body);
      },
      { body: t.Any() },
    )
    .get("/api/settings/export", async (ctx) => {
      const userId = (ctx as any).userId as string | null;
      if (!userId) {
        return unauthorized();
      }
      return handleExportAll(database, userId);
    });
}
