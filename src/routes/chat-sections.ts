// src/routes/chat-sections.ts
//
// Chat sectioning — multi-location chat spanning. Sections divide a chat's
// message stream into ordered groups, each optionally bound to a location and
// (via `chat_backgrounds`) a background. Messages are assigned to a section via
// `messages.section_id`. This is additive on top of the existing single
// `chats.current_location_id` link; the current section is a frontend
// selection applied to messages through the assignment endpoint.
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

const NullableStringSchema = t.Union([t.String(), t.Null(),],);
const OptionalNullableString = t.Optional(NullableStringSchema,);

const ChatSectionCreateBody = t.Object({
  label: t.String(),
  description: t.Optional(t.String(),),
  locationId: OptionalNullableString,
},);
const ChatSectionUpdateBody = t.Object({
  label: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
  locationId: OptionalNullableString,
},);
const ChatSectionReorderBody = t.Object({ sectionIds: t.Array(t.String(),), },);
const MessageSectionAssignBody = t.Object({ sectionId: NullableStringSchema, },);
const MessageSectionAssignResponse = t.Object({ ok: t.Boolean(), section_id: NullableStringSchema, },);

/** Chat ownership or admin check; returns true when allowed. */
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

export function chatSectionsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-sections", },)
      // ── List sections for a chat (ordered) ────────────────
      .get(
        "/api/chats/:id/sections",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const sections = await database
            .selectFrom("chat_sections",)
            .selectAll()
            .where("chat_id", "=", chatId,)
            .orderBy("sort_index", "asc",)
            .execute();

          return jsonResponse({ data: sections, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "List chat sections",
            description: "List all sections for a chat, ordered by sort index.",
            tags: ["Chats", "Sections",],
          },
        },
      )
      // ── Create a section ──────────────────────────────────
      .post(
        "/api/chats/:id/sections",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const body = ctx.body as { label: string; description?: string; locationId?: string };
          const label = (body.label ?? "").trim();
          if (!label) { return jsonResponse({ error: "label is required", }, 400,); }

          const maxIndex = await database
            .selectFrom("chat_sections",)
            .select(database.fn.max<number>("sort_index",).as("max",),)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();

          const id = uid();
          const sortIndex = (maxIndex?.max ?? 0) + 1;
          await database
            .insertInto("chat_sections",)
            .values({
              id,
              chat_id: chatId,
              label,
              description: body.description ?? null,
              location_id: body.locationId ?? null,
              sort_index: sortIndex,
            },)
            .execute();

          return jsonResponse({ id, }, 201,);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: ChatSectionCreateBody,
          response: {
            201: t.Object({ id: t.String(), },),
            400: ErrorResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Create chat section",
            description: "Create a new section appended to the end of a chat.",
            tags: ["Chats", "Sections",],
          },
        },
      )
      // ── Update a section ──────────────────────────────────
      .patch(
        "/api/chats/:id/sections/:sectionId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          const sectionId = ctx.params.sectionId as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const body = ctx.body as { label?: string; description?: string; locationId?: string | null };
          const section = await database
            .selectFrom("chat_sections",)
            .select("id",)
            .where("id", "=", sectionId,)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();
          if (!section) { return notFound("Section not found",); }

          const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), };
          if (typeof body.label === "string" && body.label.trim()) { updates.label = body.label.trim(); }
          if (typeof body.description === "string") { updates.description = body.description; }
          if (body.locationId !== undefined) { updates.location_id = body.locationId ?? null; }

          await database
            .updateTable("chat_sections",)
            .set(updates,)
            .where("id", "=", sectionId,)
            .execute();

          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), sectionId: t.String(), },),
          body: ChatSectionUpdateBody,
          response: {
            200: t.Object({ ok: t.Boolean(), },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Update chat section",
            description: "Rename or change a section's description / location.",
            tags: ["Chats", "Sections",],
          },
        },
      )
      // ── Delete a section ──────────────────────────────────
      .delete(
        "/api/chats/:id/sections/:sectionId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          const sectionId = ctx.params.sectionId as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          await database.deleteFrom("chat_sections",).where("id", "=", sectionId,).where("chat_id", "=", chatId,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), sectionId: t.String(), },),
          response: {
            200: t.Object({ ok: t.Boolean(), },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Delete chat section",
            description:
              "Remove a section. Messages keep their section_id column value (FK on delete set null is not applicable because messages are orphaned to null only on table drop; deletion clears via explicit update).",
            tags: ["Chats", "Sections",],
          },
        },
      )
      // ── Reorder sections ──────────────────────────────────
      .post(
        "/api/chats/:id/sections/reorder",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const { sectionIds, } = ctx.body as { sectionIds: string[] };
          if (!Array.isArray(sectionIds,)) { return jsonResponse({ error: "sectionIds must be an array", }, 400,); }

          const existing = await database
            .selectFrom("chat_sections",)
            .select("id",)
            .where("chat_id", "=", chatId,)
            .execute();
          const existingIds = new Set(existing.map((s,) => s.id),);
          if (sectionIds.some((id,) => !existingIds.has(id,))) {
            return jsonResponse({ error: "sectionIds contains an unknown section", }, 400,);
          }

          await database.transaction().execute(async (tx,) => {
            let index = 1;
            for (const sectionId of sectionIds) {
              await tx
                .updateTable("chat_sections",)
                .set({ sort_index: index++, updated_at: new Date().toISOString(), },)
                .where("id", "=", sectionId,)
                .execute();
            }
          },);

          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: ChatSectionReorderBody,
          response: {
            200: t.Object({ ok: t.Boolean(), },),
            400: ErrorResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Reorder chat sections",
            description: "Set the ordering of a chat's sections (full list of section ids).",
            tags: ["Chats", "Sections",],
          },
        },
      )
      // ── Assign a message to a section ─────────────────────
      .post(
        "/api/chats/:id/messages/:messageId/section",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          const messageId = ctx.params.messageId as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const body = ctx.body as { sectionId: string | null };
          const sectionId = body.sectionId ?? null;

          const message = await database
            .selectFrom("messages",)
            .select("id",)
            .where("id", "=", messageId,)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();
          if (!message) { return notFound("Message not found",); }

          if (sectionId) {
            const section = await database
              .selectFrom("chat_sections",)
              .select("id",)
              .where("id", "=", sectionId,)
              .where("chat_id", "=", chatId,)
              .executeTakeFirst();
            if (!section) { return notFound("Section not found in this chat",); }
          }

          await database
            .updateTable("messages",)
            .set({ section_id: sectionId, },)
            .where("id", "=", messageId,)
            .execute();

          return jsonResponse({ ok: true, section_id: sectionId, },);
        },
        {
          params: t.Object({ id: t.String(), messageId: t.String(), },),
          body: MessageSectionAssignBody,
          response: {
            200: MessageSectionAssignResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Assign a message to a section",
            description: "Set (or clear) which chat section a message belongs to.",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
