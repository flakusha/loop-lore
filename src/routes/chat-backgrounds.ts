// src/routes/chat-backgrounds.ts
//
// Chat backgrounds — location-scoped (or global) background assets, and the
// per-chat assignment that drives what the chat UI displays. When a chat's
// `current_location_id` changes, `autoSyncChatBackground` resolves the highest
// priority background whose `location_id` matches and updates the assignment.
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, } from "../validation/schemas";
import { jsonResponse, requireUserId, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

const BACKGROUND_TYPES = ["static", "parallax", "animated", "video", "particle",];

const OptionalNullableString = t.Optional(t.Union([t.String(), t.Null(),],),);

const ChatBackgroundCreateBody = t.Object({
  name: t.String(),
  type: t.Optional(t.String(),),
  locationId: OptionalNullableString,
  assetId: OptionalNullableString,
  config: OptionalNullableString,
  priority: t.Optional(t.Number(),),
},);

/** Upsert the chat's assigned background to `backgroundId` (one per chat). */
export async function setChatBackground(
  database: Kysely<DB>,
  chatId: string,
  backgroundId: string,
): Promise<void> {
  const existing = await database
    .selectFrom("chat_background_assignments",)
    .select("id",)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (existing) {
    await database
      .updateTable("chat_background_assignments",)
      .set({ background_id: backgroundId, },)
      .where("id", "=", existing.id,)
      .execute();
  } else {
    await database
      .insertInto("chat_background_assignments",)
      .values({ id: uid(), chat_id: chatId, background_id: backgroundId, },)
      .execute();
  }
}

/**
 * Auto-sync a chat's background after its location changes.
 *
 * Resolution: the highest priority (lowest `priority` number) background whose
 * `location_id` matches the chat's new location wins; if none matches, the
 * current assignment is left untouched (a manually chosen global background).
 * Returns the resolved background row, or null when no location-scoped match.
 */
export async function autoSyncChatBackground(
  database: Kysely<DB>,
  chatId: string,
  locationId: string,
) {
  const match = await database
    .selectFrom("chat_backgrounds",)
    .selectAll()
    .where("location_id", "=", locationId,)
    .orderBy("priority", "asc",)
    .orderBy("created_at", "asc",)
    .executeTakeFirst();

  if (match) {
    await setChatBackground(database, chatId, match.id,);
  }
  return match ?? null;
}

/** Load a chat's resolved background (assignment joined to catalog) or null. */
export async function getChatBackground(
  database: Kysely<DB>,
  chatId: string,
) {
  const row = await database
    .selectFrom("chat_background_assignments",)
    .innerJoin("chat_backgrounds", "chat_backgrounds.id", "chat_background_assignments.background_id",)
    .selectAll("chat_backgrounds",)
    .where("chat_background_assignments.chat_id", "=", chatId,)
    .executeTakeFirst();
  return row ?? null;
}

async function chatAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return !!chat && (chat.created_by === userId || userRole === "admin");
}

export function chatBackgroundsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-backgrounds", },)
      // ── Background catalog ───────────────────────────────
      .get(
        "/api/backgrounds",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const backgrounds = await database.selectFrom("chat_backgrounds",).selectAll().orderBy("name", "asc",)
            .execute();
          return jsonResponse({ data: backgrounds, },);
        },
        {
          response: {
            200: t.Any(),
            401: ErrorResponse,
          },
          detail: {
            summary: "List chat backgrounds",
            description: "List all background assets in the catalog.",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
      // ── Create a background asset ────────────────────────
      .post(
        "/api/backgrounds",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const body = ctx.body as {
            name: string;
            type?: string;
            locationId?: string | null;
            assetId?: string | null;
            config?: string | null;
            priority?: number | null;
          };
          const name = (body.name ?? "").trim();
          if (!name) { return jsonResponse({ error: "name is required", }, 400,); }
          if (body.type && !BACKGROUND_TYPES.includes(body.type,)) {
            return jsonResponse({ error: `type must be one of: ${BACKGROUND_TYPES.join(", ",)}`, }, 400,);
          }

          const id = uid();
          await database
            .insertInto("chat_backgrounds",)
            .values({
              id,
              name,
              type: body.type ?? "static",
              location_id: body.locationId ?? null,
              asset_id: body.assetId ?? null,
              config: body.config ?? null,
              priority: body.priority ?? 0,
            },)
            .execute();

          return jsonResponse({ id, }, 201,);
        },
        {
          body: ChatBackgroundCreateBody,
          response: {
            201: t.Object({ id: t.String(), },),
            400: ErrorResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Create chat background",
            description: "Create a background asset, optionally scoped to a location.",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
      // ── Current background for a chat ────────────────────
      .get(
        "/api/chats/:id/background",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }
          const background = await getChatBackground(database, chatId,);
          return jsonResponse({ data: background, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get chat background",
            description: "Return the chat's currently resolved background (or null).",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
      // ── Set a chat's background ──────────────────────────
      .post(
        "/api/chats/:id/background",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const { backgroundId, } = ctx.body as { backgroundId: string };
          const background = await database
            .selectFrom("chat_backgrounds",)
            .select("id",)
            .where("id", "=", backgroundId,)
            .executeTakeFirst();
          if (!background) { return notFound("Background not found",); }

          await setChatBackground(database, chatId, backgroundId,);
          const resolved = await getChatBackground(database, chatId,);
          return jsonResponse({ ok: true, data: resolved, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: t.Object({ backgroundId: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Set chat background",
            description: "Assign a background asset to a chat (overrides location resolution).",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
      // ── Remove a chat's background assignment ─────────────
      .delete(
        "/api/chats/:id/background",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }
          await database.deleteFrom("chat_background_assignments",).where("chat_id", "=", chatId,).execute();
          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Object({ ok: t.Boolean(), },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Remove chat background",
            description: "Clear a chat's assigned background (falls back to location resolution).",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
  );
}
