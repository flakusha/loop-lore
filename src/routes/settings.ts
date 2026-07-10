/**
 * Settings Routes
 *
 * Per-user settings CRUD:
 *   GET  /api/settings           — get current user settings
 *   PATCH /api/settings          — update current user settings
 *   GET  /api/settings/export    — bulk export user data (ZIP)
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { BAD_METHOD, jsonResponse, jsonError, HttpStatus, ErrorCode, parseBody } from "./http-utils";
import { jsonParseOr, safeJsonStringify } from "../utils";
import JSZip from "jszip";
import { ActorType } from "../db/enums";

interface GetSettingsOpts {
  database: Kysely<DB>;
  context: RequestContext;
}
interface UpdateSettingsOpts {
  database: Kysely<DB>;
  context: RequestContext;
  body: Record<string, unknown>;
}
interface ExportAllOpts {
  database: Kysely<DB>;
  context: RequestContext;
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  // ── /api/settings ───────────────────────────────────────────
  if (pathname === "/api/settings") {
    if (method === "GET") {
      return handleGetSettings({ database, context });
    }
    if (method === "PATCH") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateSettings({ database, body, context });
    }
    return BAD_METHOD();
  }

  // ── /api/settings/export (bulk data export as ZIP) ───────
  if (pathname === "/api/settings/export" && method === "GET") {
    return handleExportAll({ database, context });
  }

  return null;
};

async function handleGetSettings({ database, context }: GetSettingsOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const user = await database
    .selectFrom("users")
    .select("settings")
    .where("id", "=", userId)
    .executeTakeFirst();
  const settings = user?.settings ? jsonParseOr(user.settings, {}) : {};
  return jsonResponse(settings);
}

async function handleUpdateSettings({ database, body, context }: UpdateSettingsOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

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

async function handleExportAll({ database, context }: ExportAllOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

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
  zip.file("settings.json", JSON.stringify(settings, null, 2));
  zip.file("characters.json", JSON.stringify(characters, null, 2));
  zip.file("chats.json", JSON.stringify(chats, null, 2));
  zip.file("assets.json", JSON.stringify(assets, null, 2));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="loop-lore-export.zip"',
    },
  });
}

registerRoute(dispatch);
export { dispatch };
