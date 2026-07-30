/**
 * Character Traits Routes
 *
 * API endpoints for managing character permanent traits (Layer 0),
 * world traits (Layer 2), and location traits (Layer 3).
 */
import { Elysia, } from "elysia";
import { TraitsService, } from "../characters/services/traits-service";
import type { TranslatorFn, } from "../i18n/types";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export function characterTraitsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const traitsService = new TraitsService(database,);

  return new Elysia({ name: "character-traits", },)
    // ── Permanent Traits (Layer 0) ──────────────────────────
    .get(
      "/api/actors/:actorId/traits/permanent",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, } = ctx.params as { actorId: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const traits = await traitsService.getPermanentTraits(actorId,);
        return jsonResponse(traits,);
      },
      {
        detail: {
          summary: "List permanent traits",
          description: "Get all permanent traits for an actor (Layer 0).",
          tags: ["Character Traits",],
        },
      },
    )
    .get(
      "/api/actors/:actorId/traits/permanent/:traitName",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, traitName, } = ctx.params as { actorId: string; traitName: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const trait = await traitsService.getPermanentTrait(actorId, traitName,);
        if (!trait) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },); }
        return jsonResponse(trait,);
      },
      {
        detail: {
          summary: "Get permanent trait",
          description: "Get a specific permanent trait by name.",
          tags: ["Character Traits",],
        },
      },
    )
    .post(
      "/api/actors/:actorId/traits/permanent",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, } = ctx.params as { actorId: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const body = ctx.body as Record<string, unknown>;

        const category = body.category as string | undefined;
        const name = body.name as string | undefined;
        const value = body.value as string | undefined;

        if (!category || !name || !value) {
          return jsonError({ message: "errors.missingField", status: HttpStatus.BadRequest, t, },);
        }

        const traitId = await traitsService.createPermanentTrait({
          actorId,
          category: category as any,
          name,
          value,
        },);
        return jsonCreated({ id: traitId, },);
      },
      {
        detail: {
          summary: "Create permanent trait",
          description: "Create a new permanent trait for an actor.",
          tags: ["Character Traits",],
        },
      },
    )
    .put(
      "/api/actors/:actorId/traits/permanent/:traitName",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, traitName, } = ctx.params as { actorId: string; traitName: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const body = ctx.body as Record<string, unknown>;

        const value = body.value as string | undefined;
        if (!value) {
          return jsonError({ message: "errors.missingField", status: HttpStatus.BadRequest, t, },);
        }

        await traitsService.updatePermanentTrait(actorId, {
          name: traitName,
          value,
        },);
        return jsonResponse({ ok: true, },);
      },
      {
        detail: {
          summary: "Update permanent trait",
          description: "Update a permanent trait's value.",
          tags: ["Character Traits",],
        },
      },
    )
    .delete(
      "/api/actors/:actorId/traits/permanent/:traitName",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, traitName, } = ctx.params as { actorId: string; traitName: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        await traitsService.deletePermanentTrait(actorId, traitName,);
        return jsonNoContent();
      },
      {
        detail: {
          summary: "Delete permanent trait",
          description: "Delete a permanent trait.",
          tags: ["Character Traits",],
        },
      },
    )
    // ── World Traits (Layer 2) ──────────────────────────────
    .get(
      "/api/actors/:actorId/traits/world/:worldId",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, worldId, } = ctx.params as { actorId: string; worldId: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const traits = await traitsService.getWorldTraits(actorId, worldId,);
        return jsonResponse(traits,);
      },
      {
        detail: {
          summary: "List world traits",
          description: "Get all world-specific traits for an actor.",
          tags: ["Character Traits",],
        },
      },
    )
    .get(
      "/api/actors/:actorId/traits/world/:worldId/:traitName",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, worldId, traitName, } = ctx.params as { actorId: string; worldId: string; traitName: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const trait = await traitsService.getWorldTrait(actorId, worldId, traitName,);
        if (!trait) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },); }
        return jsonResponse(trait,);
      },
      {
        detail: {
          summary: "Get world trait",
          description: "Get a specific world trait by name.",
          tags: ["Character Traits",],
        },
      },
    )
    .post(
      "/api/actors/:actorId/traits/world/:worldId",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, worldId, } = ctx.params as { actorId: string; worldId: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const body = ctx.body as Record<string, unknown>;

        const category = body.category as string | undefined;
        const name = body.name as string | undefined;
        const value = body.value as string | undefined;

        if (!category || !name || !value) {
          return jsonError({ message: "errors.missingField", status: HttpStatus.BadRequest, t, },);
        }

        const traitId = await traitsService.createWorldTrait({
          actorId,
          worldId,
          category: category as any,
          name,
          value,
        },);
        return jsonCreated({ id: traitId, },);
      },
      {
        detail: {
          summary: "Create world trait",
          description: "Create a new world-specific trait for an actor.",
          tags: ["Character Traits",],
        },
      },
    )
    .put(
      "/api/actors/:actorId/traits/world/:worldId/:traitName",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, worldId, traitName, } = ctx.params as { actorId: string; worldId: string; traitName: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const body = ctx.body as Record<string, unknown>;

        const value = body.value as string | undefined;
        if (!value) {
          return jsonError({ message: "errors.missingField", status: HttpStatus.BadRequest, t, },);
        }

        await traitsService.updateWorldTrait(actorId, worldId, {
          name: traitName,
          value,
        },);
        return jsonResponse({ ok: true, },);
      },
      {
        detail: {
          summary: "Update world trait",
          description: "Update a world-specific trait's value.",
          tags: ["Character Traits",],
        },
      },
    )
    .delete(
      "/api/actors/:actorId/traits/world/:worldId/:traitName",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        const t = ctx.t as TranslatorFn | undefined;
        if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

        const { actorId, worldId, traitName, } = ctx.params as { actorId: string; worldId: string; traitName: string };

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        await traitsService.deleteWorldTrait(actorId, worldId, traitName,);
        return jsonNoContent();
      },
      {
        detail: {
          summary: "Delete world trait",
          description: "Delete a world-specific trait.",
          tags: ["Character Traits",],
        },
      },
    )
    // ── Location Traits (Layer 3) ───────────────────────────
    .get("/api/actors/:actorId/traits/location/:locationId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

      const { actorId, locationId, } = ctx.params as { actorId: string; locationId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      const traits = await traitsService.getLocationTraits(actorId, locationId,);
      return jsonResponse(traits,);
    },)
    .get("/api/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

      const { actorId, locationId, traitName, } = ctx.params as {
        actorId: string;
        locationId: string;
        traitName: string;
      };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      const trait = await traitsService.getLocationTrait(actorId, locationId, traitName,);
      if (!trait) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },); }
      return jsonResponse(trait,);
    },)
    .post("/api/actors/:actorId/traits/location/:locationId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

      const { actorId, locationId, } = ctx.params as { actorId: string; locationId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const name = body.name as string | undefined;
      const value = body.value as string | undefined;
      const bonus = body.bonus as number | undefined;
      const penalty = body.penalty as number | undefined;
      const effects = body.effects as Record<string, unknown> | undefined;

      if (!name || !value) {
        return jsonError({ message: "errors.missingField", status: HttpStatus.BadRequest, t, },);
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
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

      const { actorId, locationId, traitName, } = ctx.params as {
        actorId: string;
        locationId: string;
        traitName: string;
      };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const value = body.value as string | undefined;
      const bonus = body.bonus as number | undefined;
      const penalty = body.penalty as number | undefined;
      const effects = body.effects as Record<string, unknown> | undefined;

      if (!value) {
        return jsonError({ message: "errors.missingField", status: HttpStatus.BadRequest, t, },);
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
      const t = ctx.t as TranslatorFn | undefined;
      if (!userId) { return jsonError({ message: "errors.unauthorized", status: HttpStatus.Unauthorized, t, },); }

      const { actorId, locationId, traitName, } = ctx.params as {
        actorId: string;
        locationId: string;
        traitName: string;
      };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
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
