/**
 * NSFW Routes
 *
 * REST endpoints for NSFW game mechanics:
 *
 *   Intimacy:
 *     GET  /api/nsfw/intimacy/:actorId/:targetId — get intimacy pair
 *     POST /api/nsfw/intimacy/action — apply intimacy action
 *     GET  /api/nsfw/intimacy/:actorId — list all pairs for actor
 *
 *   Seduction:
 *     GET  /api/nsfw/desire/:actorId — get desire profile
 *     PUT  /api/nsfw/desire/:actorId — update desire profile
 *     GET  /api/nsfw/skills/:actorId — list seduction skills
 *     POST /api/nsfw/seduction/attempt — attempt seduction
 *
 *   Body:
 *     GET  /api/nsfw/body/:actorId — get body profile
 *     PUT  /api/nsfw/body/:actorId — update body profile
 *     GET  /api/nsfw/arousal/:actorId — get arousal state
 *     POST /api/nsfw/arousal/:actorId — modify arousal
 *
 *   Encounters:
 *     POST /api/nsfw/encounters — create encounter
 *     GET  /api/nsfw/encounters/:id — get encounter
 *     POST /api/nsfw/encounters/:id/advance — advance phase
 *     GET  /api/nsfw/encounters/world/:worldId — list encounters
 *
 *   Fantasies:
 *     GET  /api/nsfw/fantasies/:actorId — list fantasies
 *     POST /api/nsfw/fantasies — create fantasy
 *     POST /api/nsfw/fantasies/discover — attempt discovery
 *     POST /api/nsfw/fantasies/:id/explore — record exploration
 *
 *   Location:
 *     GET  /api/nsfw/location/:locationId — get location NSFW config
 *     PUT  /api/nsfw/location/:locationId — update location config
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { BodySystemService, } from "../rpg/body-systems/service";
import { EncounterService, } from "../rpg/encounters/service";
import { FantasyService, } from "../rpg/fantasies/service";
import { IntimacyService, } from "../rpg/intimacy/service";
import { LocationNsfwService, } from "../rpg/location-nsfw/service";
import { SeductionService, } from "../rpg/seduction/service";
import { jsonError, jsonResponse, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "nsfw-routes", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

export function nsfwRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  const intimacyService = new IntimacyService(database,);
  const seductionService = new SeductionService(database,);
  const bodyService = new BodySystemService(database,);
  const encounterService = new EncounterService(database,);
  const fantasyService = new FantasyService(database,);
  const locationService = new LocationNsfwService(database,);

  return (
    new Elysia({ name: "nsfw", },)
      // ── Intimacy ────────────────────────────────────────

      .get(
        "/api/nsfw/intimacy/:actorId/:targetId",
        async (ctx: any,) => {
          try {
            const worldId = (ctx.query.worldId as string) ?? null;
            const pair = await intimacyService.getPair(
              ctx.params.actorId,
              ctx.params.targetId,
              worldId,
            );
            return jsonResponse(pair,);
          } catch (error) {
            log().error("Failed to get intimacy pair", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        "/api/nsfw/intimacy/:actorId",
        async (ctx: any,) => {
          try {
            const worldId = (ctx.query.worldId as string) ?? undefined;
            const pairs = await intimacyService.getActorPairs(
              ctx.params.actorId,
              worldId,
            );
            return jsonResponse(pairs,);
          } catch (error) {
            log().error("Failed to get actor pairs", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        "/api/nsfw/intimacy/action",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const result = await intimacyService.applyAction({
              database,
              actorId: body.actorId as string,
              targetActorId: body.targetActorId as string,
              worldId: (body.worldId as string) ?? null,
              action: {
                id: body.actionId as string,
                name: body.actionName as string,
                type: body.actionType as any,
                delta: body.delta as number,
                minIntimacy: (body.minIntimacy as number) ?? 0,
                requiresConsent: (body.requiresConsent as boolean) ?? false,
              },
              context: body.context as string | undefined,
            },);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to apply intimacy action", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      // ── Seduction ───────────────────────────────────────

      .get(
        "/api/nsfw/desire/:actorId",
        async (ctx: any,) => {
          try {
            const profile = await seductionService.getDesireProfile(ctx.params.actorId,);
            return jsonResponse(profile,);
          } catch (error) {
            log().error("Failed to get desire profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .put(
        "/api/nsfw/desire/:actorId",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const success = await seductionService.updateDesireProfile(
              ctx.params.actorId,
              body,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to update desire profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        "/api/nsfw/skills/:actorId",
        async (ctx: any,) => {
          try {
            const skills = await seductionService.getActorSkills(ctx.params.actorId,);
            return jsonResponse(skills,);
          } catch (error) {
            log().error("Failed to get seduction skills", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        "/api/nsfw/seduction/attempt",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const result = await seductionService.attemptSeduction({
              database,
              actorId: body.actorId as string,
              targetId: body.targetId as string,
              skillCategory: body.skillCategory as any,
              approach: body.approach as string,
              worldId: (body.worldId as string) ?? null,
            },);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to attempt seduction", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      // ── Body ────────────────────────────────────────────

      .get(
        "/api/nsfw/body/:actorId",
        async (ctx: any,) => {
          try {
            const profile = await bodyService.getProfile(ctx.params.actorId,);
            return jsonResponse(profile,);
          } catch (error) {
            log().error("Failed to get body profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .put(
        "/api/nsfw/body/:actorId",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const success = await bodyService.updateProfile(
              ctx.params.actorId,
              body,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to update body profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        "/api/nsfw/arousal/:actorId",
        async (ctx: any,) => {
          try {
            const worldId = (ctx.query.worldId as string) ?? null;
            const arousal = await seductionService.getArousal(ctx.params.actorId, worldId,);
            return jsonResponse(arousal,);
          } catch (error) {
            log().error("Failed to get arousal state", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        "/api/nsfw/arousal/:actorId",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const newLevel = await seductionService.modifyArousal(
              ctx.params.actorId,
              body.delta as number,
              (body.worldId as string) ?? null,
              body.source as string | undefined,
            );
            return jsonResponse({ level: newLevel, },);
          } catch (error) {
            log().error("Failed to modify arousal", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      // ── Encounters ──────────────────────────────────────

      .post(
        "/api/nsfw/encounters",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const encounter = await encounterService.createEncounter({
              database,
              worldId: (body.worldId as string) ?? null,
              encounterType: body.encounterType as any,
              intensity: body.intensity as any,
              narrativeStyle: body.narrativeStyle as any,
              participants: body.participants as string[],
              contentTags: body.contentTags as string[] | undefined,
            },);
            return jsonResponse(encounter,);
          } catch (error) {
            log().error("Failed to create encounter", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        "/api/nsfw/encounters/:id",
        async (ctx: any,) => {
          try {
            const encounter = await encounterService.getEncounter(ctx.params.id,);
            if (!encounter) {
              return jsonError("Encounter not found", 404,);
            }
            return jsonResponse(encounter,);
          } catch (error) {
            log().error("Failed to get encounter", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        "/api/nsfw/encounters/:id/advance",
        async (ctx: any,) => {
          try {
            const result = await encounterService.advancePhase(ctx.params.id,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to advance encounter", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        "/api/nsfw/encounters/world/:worldId",
        async (ctx: any,) => {
          try {
            const encounters = await encounterService.listEncounters(ctx.params.worldId,);
            return jsonResponse(encounters,);
          } catch (error) {
            log().error("Failed to list encounters", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      // ── Fantasies ───────────────────────────────────────

      .get(
        "/api/nsfw/fantasies/:actorId",
        async (ctx: any,) => {
          try {
            const fantasies = await fantasyService.getActorFantasies(ctx.params.actorId,);
            return jsonResponse(fantasies,);
          } catch (error) {
            log().error("Failed to get fantasies", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        "/api/nsfw/fantasies",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const fantasy = await fantasyService.createFantasy({
              database,
              actorId: body.actorId as string,
              name: body.name as string,
              category: body.category as any,
              intensity: body.intensity as any,
              discoveredThrough: body.discoveredThrough as string | undefined,
            },);
            return jsonResponse(fantasy,);
          } catch (error) {
            log().error("Failed to create fantasy", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        "/api/nsfw/fantasies/discover",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const result = await fantasyService.attemptDiscovery(
              body.actorId as string,
              body.context as string,
              (body.discoveryChance as number) ?? 0.1,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to discover fantasy", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        "/api/nsfw/fantasies/:id/explore",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const success = await fantasyService.recordExploration(
              ctx.params.id,
              body.feeling as string | undefined,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to record exploration", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      // ── Location ────────────────────────────────────────

      .get(
        "/api/nsfw/location/:locationId",
        async (ctx: any,) => {
          try {
            const config = await locationService.getConfig(ctx.params.locationId,);
            return jsonResponse(config,);
          } catch (error) {
            log().error("Failed to get location config", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .put(
        "/api/nsfw/location/:locationId",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const success = await locationService.updateConfig(
              ctx.params.locationId,
              body,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to update location config", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
  );
}
