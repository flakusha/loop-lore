/**
 * Trade Routes
 *
 * Currency + trade endpoints over `TradeService` (src/services/trade):
 *   GET  /api/worlds/:worldId/trade/balance?actorId=&currency=  — actor balance
 *   POST /api/worlds/:worldId/trade/execute                     — atomic two-sided trade
 *
 * Ownership is resolved via the actor's owner (actors.user_id) for the
 * calling user. The `execute` endpoint accepts explicit buyer/seller actor
 * ids; the caller must own at least one side of the trade.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Db, } from "../db";
import type { DB, } from "../db/schema";
import { TradeService, } from "../services/trade";
import { ErrorResponse, Id, } from "../validation/schemas";
import { badRequestResponse, jsonError, jsonResponse, notFoundResponse, } from "./http-utils";
import { requireUserId, } from "./http-utils/responses";

const tradeLineSchema = t.Object({
  worldItemId: Id,
  quantity: t.Integer({ minimum: 1, },),
},);

const executeBody = t.Object({
  buyerActorId: Id,
  sellerActorId: Id,
  buyerItems: t.Array(tradeLineSchema,),
  sellerItems: t.Array(tradeLineSchema,),
  price: t.Integer({ minimum: 0, },),
},);

const executeResponse = t.Object({
  ok: t.Boolean(),
  pricePaid: t.Optional(t.Integer(),),
  itemsOffered: t.Optional(t.Array(Id,),),
  itemsRequested: t.Optional(t.Array(Id,),),
  reason: t.Optional(t.String(),),
},);

/** Ensure the user owns the given actor (or is the world owner). Returns denial Response or null. */
async function resolveActorAccess(
  db: Kysely<DB>,
  actorId: string,
  userId: string,
): Promise<Response | null> {
  const actor = await db.selectFrom("actors",).select("user_id",).where("id", "=", actorId,).executeTakeFirst();
  if (!actor) { return notFoundResponse("Actor",); }
  if (actor.user_id !== userId) { return jsonError("Not allowed", 403,); }
  return null;
}

export function tradeRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new TradeService(database,);
  return (
    new Elysia({ name: "trade", },)
      .get(prefix + "/worlds/:worldId/trade/balance", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const actorId = ctx.query.actorId as string | undefined;
        if (!actorId) { return badRequestResponse("actorId query param required",); }
        const denied = await resolveActorAccess(database, actorId, userId,);
        if (denied) { return denied; }
        const balance = await svc().getBalance(actorId, ctx.params.worldId, ctx.query.currency ?? "gold",);
        return jsonResponse({ actorId, worldId: ctx.params.worldId, balance, },);
      }, {
        params: t.Object({ worldId: Id, },),
        query: t.Object({ actorId: Id, currency: t.Optional(t.String(),), },),
        response: {
          200: t.Object({ actorId: Id, worldId: Id, balance: t.Integer(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Actor currency balance",
          description: "Read an actor's currency balance in a world.",
          tags: ["Trade",],
        },
      },)
      .post(prefix + "/worlds/:worldId/trade/execute", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          buyerActorId: string;
          sellerActorId: string;
          buyerItems: never[];
          sellerItems: never[];
          price: number;
        };
        // The caller must control at least one side of the trade.
        const buyerDenied = await resolveActorAccess(database, body.buyerActorId, userId,);
        const sellerDenied = await resolveActorAccess(database, body.sellerActorId, userId,);
        if (buyerDenied && sellerDenied) { return sellerDenied; }
        const res = await svc().trade({
          worldId: ctx.params.worldId,
          buyerActorId: body.buyerActorId,
          sellerActorId: body.sellerActorId,
          buyerItems: body.buyerItems,
          sellerItems: body.sellerItems,
          price: body.price,
        },);
        if (!res.success) { return badRequestResponse(res.reason ?? "Trade failed",); }
        return jsonResponse({ ok: true, ...res, },);
      }, {
        params: t.Object({ worldId: Id, },),
        body: executeBody,
        response: {
          200: executeResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Execute trade",
          description: "Atomically exchange items + gold between two actors.",
          tags: ["Trade",],
        },
      },)
      .onError(({ code, error, set, },) => {
        if (code === "NOT_FOUND") {
          set.status = 404;
          return { error: "Resource not found", };
        }
        if (code === "VALIDATION") {
          set.status = 400;
          return { error: String(error,), };
        }
      },)
  ) as unknown as Elysia;
}
