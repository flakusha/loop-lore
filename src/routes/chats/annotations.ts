// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Annotations routes — GM-style chat annotations.
 *
 * Vertical slice for `TASK-chat-feature-notes-shadow-carriage`.
 *
 * POST /api/chats/:id/annotations — create a new annotation
 * GET  /api/chats/:id/annotations — list annotations (shadow kind
 *   reads from `shadow_notes`; note/quest kind reads from the
 *   in-memory store in the annotations module).
 *
 * Frontend wiring is intentionally out of scope for this slice.
 */

import { Elysia, t, } from "elysia";
import { checkChatAccess, } from "../../chat/service";
import {
  createAnnotation,
  listMemoryAnnotations,
  type AnnotationKind,
} from "../../chat/proactive/annotations";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import {
  badRequestResponse as badRequest,
  jsonCreated,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

const ANNOTATION_KINDS: readonly AnnotationKind[] = ["note", "shadow", "quest",];

const isAnnotationKind = (value: unknown,): value is AnnotationKind =>
  typeof value === "string" && ANNOTATION_KINDS.includes(value as AnnotationKind,);

/**
 * @param opts
 * @param prefix
 */
export function annotationRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  return new Elysia({ name: "chats-annotations", },)
    .post(
      `${prefix}/chats/:id/annotations`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const chatId = (ctx.params as { id: string }).id;
        const body = ctx.body as {
          kind?: unknown;
          body?: unknown;
          ttlMs?: unknown;
        };

        const access = await checkChatAccess(
          database,
          chatId,
          userId,
          ctx.userRole as string | null,
        );
        if (!access.ok) { return notFound("Chat not found",); }

        if (!isAnnotationKind(body.kind,)) {
          return badRequest(
            `Annotation kind must be one of: ${ANNOTATION_KINDS.join(", ")}`,
          );
        }
        if (typeof body.body !== "string" || body.body.length === 0) {
          return badRequest("Annotation body cannot be empty",);
        }
        const ttlMs = typeof body.ttlMs === "number" ? body.ttlMs : undefined;
        if (ttlMs !== undefined && (!Number.isFinite(ttlMs,) || ttlMs < 0)) {
          return badRequest("ttlMs must be a non-negative finite number",);
        }

        const annotation = await createAnnotation(database, {
          chatId,
          kind: body.kind,
          actorId: userId,
          body: body.body,
          ttlMs,
        },);
        return jsonCreated({ data: annotation, },);
      },
      {
        params: t.Object({ id: t.String(), },),
        body: t.Object({
          kind: t.Union([
            t.Literal("note",),
            t.Literal("shadow",),
            t.Literal("quest",),
          ],),
          body: t.String({ minLength: 1, },),
          ttlMs: t.Optional(t.Number(),),
        },),
        response: {
          201: SuccessResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },
    )
    .get(
      `${prefix}/chats/:id/annotations`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const chatId = (ctx.params as { id: string }).id;

        const access = await checkChatAccess(
          database,
          chatId,
          userId,
          ctx.userRole as string | null,
        );
        if (!access.ok) { return notFound("Chat not found",); }

        const shadowRows = await database
          .selectFrom("shadow_notes",)
          .select(["id", "chat_id", "content", "created_at",],)
          .where("chat_id", "=", chatId,)
          .execute();
        const shadowAnnotations = shadowRows.map((row,) => ({
          id: row.id,
          chatId: row.chat_id,
          actorId: "",
          kind: "shadow" as const,
          body: row.content,
          createdAt: row.created_at,
          ttlUntil: null,
        }),);
        const memory = listMemoryAnnotations(chatId,);
        return jsonResponse({ data: [...shadowAnnotations, ...memory,], },);
      },
      {
        params: t.Object({ id: t.String(), },),
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },
    );
}