/**
 * Character Traits Routes
 *
 * API endpoints for managing character permanent traits (Layer 0),
 * world traits (Layer 2), and location traits (Layer 3).
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { TraitsService, } from "../characters/services/traits-service";
import type { DB, } from "../db/schema";
import { jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

/** Check if user owns the actor (or is admin/solo) */
async function checkActorOwnership(
  database: Kysely<DB>,
  actorId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  const actor = await database
    .selectFrom("actors",)
    .select("owner_id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  if (!actor) { return false; }
  return actor.owner_id === userId || userRole === "admin" || userRole === "solo";
}

export function characterTraitsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const traitsService = new TraitsService(database,);

  return new Elysia({ name: "character-traits", },)
    // ── Permanent Traits (Layer 0) ──────────────────────────
    .get("/api/actors/:actorId/traits/permanent", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const traits = await traitsService.getPermanentTraits(actorId,);
      return jsonResponse(traits,);
    },)
    .get("/api/actors/:actorId/traits/permanent/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, traitName, } = ctx.params as { actorId: string; traitName: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const trait = await traitsService.getPermanentTrait(actorId, traitName,);
      if (!trait) { return jsonError({ message: "Trait not found", status: HttpStatus.NotFound, },); }
      return jsonResponse(trait,);
    },)
    .post("/api/actors/:actorId/traits/permanent", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const category = body.category as string | undefined;
      const name = body.name as string | undefined;
      const value = body.value as string | undefined;

      if (!category || !name || !value) {
        return jsonError({ message: "category, name, and value are required", status: HttpStatus.BadRequest, },);
      }

      const traitId = await traitsService.createPermanentTrait({
        actorId,
        category: category as any,
        name,
        value,
      },);
      return jsonCreated({ id: traitId, },);
    },)
    .put("/api/actors/:actorId/traits/permanent/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, traitName, } = ctx.params as { actorId: string; traitName: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const value = body.value as string | undefined;
      if (!value) {
        return jsonError({ message: "value is required", status: HttpStatus.BadRequest, },);
      }

      await traitsService.updatePermanentTrait(actorId, {
        name: traitName,
        value,
      },);
      return jsonResponse({ ok: true, },);
    },)
    .delete("/api/actors/:actorId/traits/permanent/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, traitName, } = ctx.params as { actorId: string; traitName: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      await traitsService.deletePermanentTrait(actorId, traitName,);
      return jsonNoContent();
    },)
    // ── World Traits (Layer 2) ──────────────────────────────
    .get("/api/actors/:actorId/traits/world/:worldId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, worldId, } = ctx.params as { actorId: string; worldId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const traits = await traitsService.getWorldTraits(actorId, worldId,);
      return jsonResponse(traits,);
    },)
    .get("/api/actors/:actorId/traits/world/:worldId/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, worldId, traitName, } = ctx.params as { actorId: string; worldId: string; traitName: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const trait = await traitsService.getWorldTrait(actorId, worldId, traitName,);
      if (!trait) { return jsonError({ message: "Trait not found", status: HttpStatus.NotFound, },); }
      return jsonResponse(trait,);
    },)
    .post("/api/actors/:actorId/traits/world/:worldId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, worldId, } = ctx.params as { actorId: string; worldId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const category = body.category as string | undefined;
      const name = body.name as string | undefined;
      const value = body.value as string | undefined;

      if (!category || !name || !value) {
        return jsonError({ message: "category, name, and value are required", status: HttpStatus.BadRequest, },);
      }

      const traitId = await traitsService.createWorldTrait({
        actorId,
        worldId,
        category: category as any,
        name,
        value,
      },);
      return jsonCreated({ id: traitId, },);
    },)
    .put("/api/actors/:actorId/traits/world/:worldId/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, worldId, traitName, } = ctx.params as { actorId: string; worldId: string; traitName: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const value = body.value as string | undefined;
      if (!value) {
        return jsonError({ message: "value is required", status: HttpStatus.BadRequest, },);
      }

      await traitsService.updateWorldTrait(actorId, worldId, {
        name: traitName,
        value,
      },);
      return jsonResponse({ ok: true, },);
    },)
    .delete("/api/actors/:actorId/traits/world/:worldId/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, worldId, traitName, } = ctx.params as { actorId: string; worldId: string; traitName: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      await traitsService.deleteWorldTrait(actorId, worldId, traitName,);
      return jsonNoContent();
    },)
    // ── Location Traits (Layer 3) ───────────────────────────
    .get("/api/actors/:actorId/traits/location/:locationId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, locationId, } = ctx.params as { actorId: string; locationId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const traits = await traitsService.getLocationTraits(actorId, locationId,);
      return jsonResponse(traits,);
    },)
    .get("/api/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, locationId, traitName, } = ctx.params as {
        actorId: string;
        locationId: string;
        traitName: string;
      };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const trait = await traitsService.getLocationTrait(actorId, locationId, traitName,);
      if (!trait) { return jsonError({ message: "Trait not found", status: HttpStatus.NotFound, },); }
      return jsonResponse(trait,);
    },)
    .post("/api/actors/:actorId/traits/location/:locationId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, locationId, } = ctx.params as { actorId: string; locationId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const name = body.name as string | undefined;
      const value = body.value as string | undefined;
      const bonus = body.bonus as number | undefined;
      const penalty = body.penalty as number | undefined;
      const effects = body.effects as Record<string, unknown> | undefined;

      if (!name || !value) {
        return jsonError({ message: "name and value are required", status: HttpStatus.BadRequest, },);
      }

      const traitId = await traitsService.createLocationTrait({
        actorId,
        locationId,
        name,
        value,
        bonus: bonus ?? 0,
        penalty: penalty ?? 0,
        effects: effects ?? {},
      },);
      return jsonCreated({ id: traitId, },);
    },)
    .put("/api/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, locationId, traitName, } = ctx.params as {
        actorId: string;
        locationId: string;
        traitName: string;
      };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const value = body.value as string | undefined;
      const bonus = body.bonus as number | undefined;
      const penalty = body.penalty as number | undefined;
      const effects = body.effects as Record<string, unknown> | undefined;

      if (!value) {
        return jsonError({ message: "value is required", status: HttpStatus.BadRequest, },);
      }

      await traitsService.updateLocationTrait(actorId, locationId, {
        name: traitName,
        value,
        bonus: bonus ?? 0,
        penalty: penalty ?? 0,
        effects: effects ?? {},
      },);
      return jsonResponse({ ok: true, },);
    },)
    .delete("/api/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, locationId, traitName, } = ctx.params as {
        actorId: string;
        locationId: string;
        traitName: string;
      };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      await traitsService.deleteLocationTrait(actorId, locationId, traitName,);
      return jsonNoContent();
    },)
    // ── Bulk Traits ─────────────────────────────────────────
    .get("/api/actors/:actorId/traits", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const worldId = ctx.query.worldId as string | undefined;
      const locationId = ctx.query.locationId as string | undefined;

      const traits = await traitsService.getAllTraits(actorId, worldId, locationId,);
      return jsonResponse(traits,);
    },);
}
