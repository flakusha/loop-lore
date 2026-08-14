import { Elysia, t, } from "elysia";
import { checkChatAccess, } from "../../chat/service";
import { forbiddenResponse as forbidden, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function transferRoutes(opts: HandlerOpts, prefix = "/api") {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-search-transfer", },)
      // ── Transfer chat to new location ────────────────────────
      .post(
        prefix + "/chats/:id/transfer",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;

          const chatId = (ctx.params as { id: string }).id;
          const body = ctx.body as { locationId: string };
          if (!body?.locationId) {
            return jsonError({ message: "locationId required", status: 400, },);
          }

          // Check access
          const access = await checkChatAccess(database, chatId, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          // Get chat to check world_id
          const chat = await database
            .selectFrom("chats",)
            .select("world_id",)
            .where("id", "=", chatId,)
            .executeTakeFirst();

          if (!chat) {
            return jsonError({ message: "Chat not found", status: 404, },);
          }

          // Verify location exists and belongs to same world
          const location = await database
            .selectFrom("locations",)
            .select(["id", "world_id",],)
            .where("id", "=", body.locationId,)
            .executeTakeFirst();

          if (!location) {
            return jsonError({ message: "Location not found", status: 404, },);
          }

          if (location.world_id !== chat.world_id) {
            return jsonError({ message: "Location not in chat's world", status: 400, },);
          }

          // Update chat location
          await database
            .updateTable("chats",)
            .set({
              current_location_id: body.locationId,
              updated_at: new Date().toISOString(),
            },)
            .where("id", "=", chatId,)
            .execute();

          log().info("Chat transferred", { chatId, locationId: body.locationId, },);

          return jsonResponse({ ok: true, locationId: body.locationId, },);
        },
        {
          params: t.Object({ id: t.String({ format: "uuid", },), },),
          body: t.Object({ locationId: t.String({ format: "uuid", },), },),
        },
      )
  );
}
