// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Internal Traits Routes
 *
 * CRUD + prompt assembly endpoint for character internal traits
 * (aspirations, moral disposition, autonomy, coping, approach, voice).
 *
 * See .plan/epics/epic-character-internal-traits.md
 */
import { Elysia, t, } from "elysia";
import { CharacterInternalTraitsService, } from "../../characters/services/internal-traits";
import { type HandlerOpts, requireActorAccess, } from "../actor-auth";
import { jsonError, jsonResponse, } from "../http-utils";

const R = "/api/character-internal-traits";

const aspirationSchema = t.Object({
  id: t.String(),
  goal: t.String(),
  plans: t.Array(t.String(),),
  visibility: t.Union([t.Literal("hidden",), t.Literal("hinted",), t.Literal("open",),],),
  priority: t.Union([t.Literal("high",), t.Literal("medium",), t.Literal("low",),],),
  progress: t.Number(),
},);

const moralDispositionSchema = t.Object({
  lawful_chaotic: t.Optional(t.Number(),),
  good_evil: t.Optional(t.Number(),),
},);

const autonomyPreferencesSchema = t.Object({
  group_comfort: t.Optional(t.Number(),),
  solo_comfort: t.Optional(t.Number(),),
  separation_triggers: t.Optional(t.Array(t.String(),),),
  reunion_triggers: t.Optional(t.Array(t.String(),),),
},);

const copingMechanismsSchema = t.Object({
  stress_response: t.Optional(t.String(),),
  failure_response: t.Optional(t.String(),),
  conflict_style: t.Optional(t.String(),),
},);

const approachTendenciesSchema = t.Object({
  decision_style: t.Optional(t.String(),),
  risk_tolerance: t.Optional(t.Number(),),
  initiative_level: t.Optional(t.Number(),),
},);

const voicePatternsSchema = t.Object({
  verbal_tics: t.Optional(t.Array(t.String(),),),
  vocabulary_level: t.Optional(t.String(),),
  sentence_structure: t.Optional(t.String(),),
  humor_style: t.Optional(t.String(),),
  emotional_range: t.Optional(t.Number(),),
},);

const inputBody = t.Object({
  aspirations: t.Optional(t.Array(aspirationSchema,),),
  moralDisposition: t.Optional(moralDispositionSchema,),
  autonomyPreferences: t.Optional(autonomyPreferencesSchema,),
  copingMechanisms: t.Optional(copingMechanismsSchema,),
  approachTendencies: t.Optional(approachTendenciesSchema,),
  voicePatterns: t.Optional(voicePatternsSchema,),
  visibility: t.Optional(t.Array(t.String(),),),
},);

const actorQuery = t.Object({ actorId: t.String(), },);

export function characterInternalTraitsRoutes(opts: HandlerOpts,) {
  const svc = () => new CharacterInternalTraitsService(opts.database,);

  return new Elysia({ name: "character-internal-traits", },)
    // ── Get internal traits ──────────────────────────────
    .get(R, async (ctx: any,) => {
      // IDOR fix (BUG-character-internal-traits-idor-cross-user-read-write-delete):
      // requireActorAccess enforces owner/admin on every read.
      const { actorId, } = ctx.query as { actorId: string };
      const userId = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (userId instanceof Response) { return userId; }
      try {
        const traits = await svc().get(actorId,);
        return jsonResponse(traits,);
      } catch (error) {
        logErr("Failed to get internal traits", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: actorQuery,
      detail: {
        summary: "Get character internal traits",
        description: "Get aspirations, moral disposition, autonomy, coping, approach, and voice patterns.",
        tags: ["Character Internal Traits",],
      },
    },)
    // ── Create/update internal traits ────────────────────
    .put(R, async (ctx: any,) => {
      // IDOR fix (BUG-character-internal-traits-idor-actor-ownership-never-checked):
      // requireActorAccess checks the user owns the actor (or has admin).
      // The actor id lives on ctx.query (legacy) — synthesize a params shape
      // so the existing helper can read it.
      const { actorId, } = ctx.query as { actorId: string };
      const userId = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (userId instanceof Response) { return userId; }
      const body = ctx.body as Record<string, unknown>;
      try {
        const traits = await svc().upsert(actorId, body,);
        return jsonResponse(traits,);
      } catch (error) {
        logErr("Failed to upsert internal traits", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: actorQuery,
      body: inputBody,
      detail: {
        summary: "Create or update character internal traits",
        description:
          "Set aspirations, moral disposition, autonomy preferences, coping mechanisms, approach tendencies, and voice patterns.",
        tags: ["Character Internal Traits",],
      },
    },)
    // ── Delete internal traits ────────────────────────────
    .delete(R, async (ctx: any,) => {
      // IDOR fix (see PUT above for rationale).
      const { actorId, } = ctx.query as { actorId: string };
      const userId = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (userId instanceof Response) { return userId; }
      try {
        const deleted = await svc().delete(actorId,);
        return jsonResponse({ deleted, },);
      } catch (error) {
        logErr("Failed to delete internal traits", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: actorQuery,
      detail: {
        summary: "Delete character internal traits",
        description: "Remove all internal traits for a character.",
        tags: ["Character Internal Traits",],
      },
    },)
    // ── Get prompt assembly section ──────────────────────
    .get(`${R}/prompt`, async (ctx: any,) => {
      // IDOR fix (BUG-character-internal-traits-idor-cross-user-read-write-delete):
      // includeHidden=true leaks hidden aspirations to non-owners without this check.
      const { actorId, } = ctx.query as { actorId: string };
      const userId = await requireActorAccess(
        { ...ctx, params: { actorId, }, } as Parameters<typeof requireActorAccess>[0],
        opts.database,
      );
      if (userId instanceof Response) { return userId; }
      const includeHidden = (ctx.query as Record<string, string>).includeHidden === "true";
      try {
        const section = await svc().buildPromptSection(actorId, includeHidden,);
        return jsonResponse({ section, },);
      } catch (error) {
        logErr("Failed to build prompt section", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: t.Object({
        actorId: t.String(),
        includeHidden: t.Optional(t.String(),),
      },),
      detail: {
        summary: "Get prompt assembly section for internal traits",
        description:
          "Generate the internal traits section for prompt assembly. Only includes fields the character is open about (unless includeHidden=true).",
        tags: ["Character Internal Traits",],
      },
    },);
}

function logErr(msg: string, err: unknown,): void {
  console.error(`[character-internal-traits] ${msg}`, err,);
}
