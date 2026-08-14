import { Elysia, } from "elysia";
import { batchArchiveChats, batchDeleteChats, batchExportChats, } from "../../chat/service";
import { safeJsonStringify, } from "../../utils";
import { BatchIdsBody, } from "../../validation/schemas";
import { jsonResponse, notFoundResponse as notFound, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export function batchRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-batch", },)
      // ── Batch chat operations ──────────────────────────────────
      .post(
        `${prefix}/chats/batch/archive`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const ids = (ctx.body as { ids: string[] }).ids;
          const archived = await batchArchiveChats(database, ids, userId,);
          if (archived.length === 0) { return notFound("No chats found",); }
          return jsonResponse({ ok: true, archived: archived.length, },);
        },
        { body: BatchIdsBody, },
      )
      .post(
        `${prefix}/chats/batch/delete`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const ids = (ctx.body as { ids: string[] }).ids;
          const deleted = await batchDeleteChats(database, ids, userId,);
          if (deleted === 0) { return notFound("No chats found",); }
          return jsonResponse({ ok: true, deleted, },);
        },
        { body: BatchIdsBody, },
      )
      .post(
        `${prefix}/chats/batch/export`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const ids = (ctx.body as { ids: string[] }).ids;
          const exportData = await batchExportChats(database, ids, userId,);
          if (!exportData) { return notFound("No chats found",); }
          const json = safeJsonStringify(exportData,);
          return new Response(json.ok ? json.value : "[]", {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": 'attachment; filename="chats-export.json"',
            },
          },);
        },
        { body: BatchIdsBody, },
      )
  );
}
