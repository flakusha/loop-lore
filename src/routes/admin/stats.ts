import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function statsRoutes(opts: AdminRouteOpts,) {
  const db = opts.database;

  return (
    new Elysia({ name: "admin-stats", },)
      // ── Stats ──────────────────────────────────────────────
      .get("/api/admin/stats", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const [userCount, chatCount, messageCount, characterCount, assetCount,] = await Promise.all([
          db.selectFrom("users",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db.selectFrom("chats",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db.selectFrom("messages",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db
            .selectFrom("actors",)
            .select(db.fn.countAll<number>().as("n",),)
            .where("actor_type", "=", "character" as any,)
            .executeTakeFirst(),
          db.selectFrom("assets",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
        ],);

        return jsonResponse({
          users: userCount?.n ?? 0,
          chats: chatCount?.n ?? 0,
          messages: messageCount?.n ?? 0,
          characters: characterCount?.n ?? 0,
          assets: assetCount?.n ?? 0,
        },);
      }, {
        response: {
          200: t.Object({
            users: t.Number(),
            chats: t.Number(),
            messages: t.Number(),
            characters: t.Number(),
            assets: t.Number(),
          },),
          403: ErrorResponse,
        },
      },)
  );
}
