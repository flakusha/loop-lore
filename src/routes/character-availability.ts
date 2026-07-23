/**
 * Character Availability Routes
 *
 * API endpoints for managing character availability status,
 * usage policies, activity restrictions, and content policies.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function characterAvailabilityRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "character-availability", },)
    // ── Get availability for an actor ──────────────────────────
    .get("/api/actors/:actorId/availability", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      const availability = await database
        .selectFrom("character_availability",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      if (!availability) {
        return jsonError({ message: "Availability not found", status: HttpStatus.NotFound, },);
      }
      return jsonResponse(availability,);
    },)
    // ── Create or update availability ──────────────────────────
    .post("/api/actors/:actorId/availability", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      const status = body.status as string | undefined;
      const usagePolicy = body.usagePolicy as string | undefined;
      const activityRestrictions = body.activityRestrictions as string[] | undefined;
      const contentPolicy = body.contentPolicy as string | undefined;
      const nsfwPolicy = body.nsfwPolicy as string | undefined;

      // Upsert
      const existing = await database
        .selectFrom("character_availability",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      if (existing) {
        await database
          .updateTable("character_availability",)
          .set({
            status: (status as any) ?? existing.status,
            usage_policy: usagePolicy ?? existing.usage_policy,
            activity_restrictions: activityRestrictions
              ? JSON.stringify(activityRestrictions,)
              : existing.activity_restrictions,
            content_policy: contentPolicy ?? existing.content_policy,
            nsfw_policy: nsfwPolicy ?? existing.nsfw_policy,
            updated_at: new Date().toISOString(),
          },)
          .where("id", "=", existing.id,)
          .execute();
        return jsonResponse({ id: existing.id, updated: true, },);
      }

      const id = crypto.randomUUID();
      await database
        .insertInto("character_availability",)
        .values({
          id,
          actor_id: actorId,
          status: (status as any) ?? "available",
          usage_policy: usagePolicy ?? null,
          activity_restrictions: activityRestrictions ? JSON.stringify(activityRestrictions,) : "[]",
          content_policy: contentPolicy ?? null,
          nsfw_policy: nsfwPolicy ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },)
        .execute();

      return jsonCreated({ id, },);
    },)
    // ── Delete availability ────────────────────────────────────
    .delete("/api/actors/:actorId/availability", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      await database
        .deleteFrom("character_availability",)
        .where("actor_id", "=", actorId,)
        .execute();

      return jsonResponse({ ok: true, },);
    },);
}
