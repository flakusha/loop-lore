/**
 * Character Emotions Routes
 *
 * API endpoints for managing character emotions,
 * emotion intensity, and context tracking.
 */
import { Elysia, } from "elysia";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export function characterEmotionsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "character-emotions", },)
    // ── List emotions for an actor ─────────────────────────────
    .get("/api/actors/:actorId/emotions", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const emotions = await database
        .selectFrom("character_emotions",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .execute();

      return jsonResponse(emotions,);
    }, {
      detail: {
        summary: "List actor emotions",
        description: "List all emotions currently active for an actor.",
        tags: ["Character Emotions",],
      },
    },)
    // ── Get a specific emotion ─────────────────────────────────
    .get("/api/actors/:actorId/emotions/:emotionId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params as { actorId: string };
      const { emotionId, } = ctx.params as { emotionId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const emotion = await database
        .selectFrom("character_emotions",)
        .selectAll()
        .where("id", "=", emotionId,)
        .executeTakeFirst();

      if (!emotion) {
        return jsonError({
          message: ctx.t?.("characters.emotionNotFound",) ?? "Emotion not found",
          status: HttpStatus.NotFound,
        },);
      }
      return jsonResponse(emotion,);
    }, {
      detail: {
        summary: "Get actor emotion",
        description: "Get a specific emotion by ID for an actor.",
        tags: ["Character Emotions",],
      },
    },)
    // ── Set/update an emotion for an actor ─────────────────────
    .post("/api/actors/:actorId/emotions", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const body = ctx.body as Record<string, unknown>;

      const emotionId = body.emotionId as string | undefined;
      const intensity = body.intensity as number | undefined;
      const context = body.context as string | undefined;
      const expiresAt = body.expiresAt as string | undefined;

      if (!emotionId) {
        return jsonError({ message: "emotionId is required", status: HttpStatus.BadRequest, },);
      }

      // Upsert: check if emotion already exists for this actor
      const existing = await database
        .selectFrom("character_emotions",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .where("emotion_id", "=", emotionId,)
        .executeTakeFirst();

      if (existing) {
        await database
          .updateTable("character_emotions",)
          .set({
            intensity: intensity ?? existing.intensity,
            context: context ?? existing.context,
            expires_at: expiresAt ?? existing.expires_at,
            updated_at: new Date().toISOString(),
          },)
          .where("id", "=", existing.id,)
          .execute();
        return jsonResponse({ id: existing.id, updated: true, },);
      }

      const id = crypto.randomUUID();
      await database
        .insertInto("character_emotions",)
        .values({
          id,
          actor_id: actorId,
          emotion_id: emotionId,
          intensity: intensity ?? 0.5,
          context: context ?? null,
          expires_at: expiresAt ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },)
        .execute();

      return jsonCreated({ id, },);
    }, {
      detail: {
        summary: "Set actor emotion",
        description: "Set or update an emotion for an actor. Upserts by emotion ID.",
        tags: ["Character Emotions",],
      },
    },)
    // ── Delete an emotion ──────────────────────────────────────
    .delete("/api/actors/:actorId/emotions/:emotionId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params as { actorId: string };
      const { emotionId, } = ctx.params as { emotionId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      await database
        .deleteFrom("character_emotions",)
        .where("id", "=", emotionId,)
        .execute();

      return jsonResponse({ ok: true, },);
    }, {
      detail: {
        summary: "Delete actor emotion",
        description: "Remove an emotion from an actor.",
        tags: ["Character Emotions",],
      },
    },)
    // ── List all emotion definitions ───────────────────────────
    .get("/api/emotions", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const emotions = await database
        .selectFrom("emotions",)
        .selectAll()
        .execute();

      return jsonResponse(emotions,);
    }, {
      detail: {
        summary: "List emotion definitions",
        description: "List all available emotion definitions (name, valence, arousal, etc).",
        tags: ["Character Emotions",],
      },
    },)
    // ── Create a new emotion definition ────────────────────────
    .post("/api/emotions", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const body = ctx.body as Record<string, unknown>;

      const name = body.name as string | undefined;
      const displayName = body.displayName as string | undefined;
      const category = body.category as string | undefined;
      const valence = body.valence as number | undefined;
      const arousal = body.arousal as number | undefined;
      const icon = body.icon as string | undefined;

      if (
        !name || displayName === undefined || category === undefined || valence === undefined || arousal === undefined
      ) {
        return jsonError({
          message: "name, displayName, category, valence, and arousal are required",
          status: HttpStatus.BadRequest,
        },);
      }

      const id = crypto.randomUUID();
      await database
        .insertInto("emotions",)
        .values({
          id,
          name,
          display_name: displayName,
          category,
          valence,
          arousal,
          icon: icon ?? null,
          created_at: new Date().toISOString(),
        },)
        .execute();

      return jsonCreated({ id, },);
    }, {
      detail: {
        summary: "Create emotion definition",
        description: "Create a new emotion definition with name, category, valence, and arousal.",
        tags: ["Character Emotions",],
      },
    },);
}
