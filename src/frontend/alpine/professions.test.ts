// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the professions panel mixin (TASK-professions-frontend).
 *
 * Mirrors rpg-stats.test.ts: mocks `./htmx` apiFetch, builds a minimal ctx
 * from the `professions` slice, and asserts on request shape + state.
 *
 * Pins the contract:
 *   - loadProfessions GETs the actor-scoped route; 404 (not visible) renders
 *     the empty state without an error
 *   - selectProfession GETs /:id and stores specializations; 404 clears the
 *     selection quietly
 *   - assignProfession POSTs { actorId, discipline }
 *   - addProfessionXp POSTs { amount: PROFESSION_XP_STEP } and surfaces level-up/title feedback
 *   - addProfessionSpecialization POSTs { name, bonusType, bonusValue }
 *   - the client progression mirror (bonuses ladder, next title, XP bar)
 *     matches the server source of truth (progression.ts)
 */
import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { LEVEL_XP, MAX_LEVEL, progressionBonuses, titleForLevel, } from "../../rpg/crafting/professions/progression";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { PROFESSION_DISCIPLINES, PROFESSION_XP_STEP, professions, } from "./professions";
import type { ChatState, ProfessionView, } from "./types";

let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

function buildCtx(overrides: Record<string, unknown> = {},): ChatState {
  const base: Record<string, unknown> = {
    activeChat: "chat-1",
    professions: [],
    professionsLoading: false,
    professionsError: null,
    selectedProfessionId: null,
    selectedProfessionSpecs: null,
    professionsBusyId: null,
    professionFeedback: null,
    specDraft: { name: "", bonusType: "quality", bonusValue: 5, },
    assignDiscipline: "",
    assignBusy: false,
    disciplines: PROFESSION_DISCIPLINES,
    ...professions,
    ...overrides,
  };

  return base as unknown as ChatState;
}

const PROFESSION: ProfessionView = {
  id: "prof-1",
  discipline: "alchemy",
  level: 30,
  experience: 60,
  title: "journeyman",
};

/** Route chats lookup (actor resolution) and the professions API. */
function mockChats(actorId: string | null,): void {
  fetchHandler = (url,) => {
    if (url === "/api/v1/chats/chat-1") {
      return Response.json({ character_id: actorId, },);
    }

    return new Response("{}", { status: 500, },);
  };
}

/** Pin the client constants/mirror against the server progression module. */
test("client progression mirror matches the server source of truth", () => {
  const ctx = buildCtx();
  expect(ctx.xpProgress({ level: 30, experience: 60, },),).toBe(60 / LEVEL_XP,);
  expect(ctx.xpProgress({ level: MAX_LEVEL, experience: 99999, },),).toBe(1,);
  for (const level of [1, 25, 26, 50, 51, 75, 76, 99, 100,]) {
    const client = ctx.professionBonuses(level,);
    const server = progressionBonuses(level,);
    expect(Math.round(client.success * 100,),).toBe(server.success * 100,);
    expect(Math.round(client.quality * 100,),).toBe(server.quality * 100,);
    expect(Math.round(client.speed * 100,),).toBe(server.speed * 100,);
    expect(Math.round(client.materialSaving * 100,),).toBe(server.materialSaving * 100,);
  }

  // Title bands + next-title level mirror titleForLevel.
  for (const level of [1, 25, 26, 50, 51, 75, 76, 99, 100,]) {
    const next = ctx.nextTitleAt(level,);
    if (next === null) {
      expect(titleForLevel(level,),).toBe("grandmaster",);
    }

    // The next-title level itself is exactly the first level of the next band.
    if (next !== null) {
      expect(titleForLevel(next - 1,),).not.toBe(titleForLevel(next,),);
    }
  }
});

describeOrSkip("professions.loadProfessions", () => {
  test("GETs the actor-scoped route for the chat's actor", async () => {
    const ctx = buildCtx();
    fetchHandler = (url,) => {
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url === "/api/rpg/professions/actors/actor-1") {
        return Response.json({ professions: [PROFESSION,], },);
      }

      return new Response("{}", { status: 500, },);
    };

    await ctx.loadProfessions();

    expect(ctx.professionsError,).toBeNull();
    expect(ctx.professionsLoading,).toBe(false,);
    expect(ctx.professions.length,).toBe(1,);
    expect(fetchCalls.find((c,) => c.url === "/api/rpg/professions/actors/actor-1"),).toBeDefined();
  });

  test("renders the empty state on 404 (not visible), without an error", async () => {
    const ctx = buildCtx();
    fetchHandler = (url,) => {
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url.startsWith("/api/rpg/professions/actors/",)) { return new Response("{}", { status: 404, },); }

      return new Response("{}", { status: 500, },);
    };

    await ctx.loadProfessions();

    expect(ctx.professions,).toEqual([],);
    expect(ctx.professionsError,).toBeNull();
  });
},);

describeOrSkip("professions.selectProfession", () => {
  test("GETs /:id and stores specializations", async () => {
    const ctx = buildCtx();
    fetchHandler = (url,) => {
      if (url === "/api/rpg/professions/prof-1") {
        return Response.json({
          ...PROFESSION,
          specializations: [{
            id: "spec-1",
            name: "Fire-Proofing",
            bonusType: "quality",
            bonusValue: 5,
            description: null,
            requirementLevel: 5,
          },],
        },);
      }

      return new Response("{}", { status: 500, },);
    };

    await ctx.selectProfession("prof-1",);

    expect(ctx.selectedProfessionId,).toBe("prof-1",);
    expect(ctx.selectedProfessionSpecs?.length,).toBe(1,);
    expect(ctx.selectedProfessionSpecs?.[0]?.name,).toBe("Fire-Proofing",);
  });

  test("clears the selection quietly on 404 (not visible)", async () => {
    const ctx = buildCtx({ selectedProfessionId: null, professions: [PROFESSION,], },);
    fetchHandler = (url,) => {
      if (url === "/api/rpg/professions/prof-1") { return new Response("{}", { status: 404, },); }

      return new Response("{}", { status: 500, },);
    };

    await ctx.selectProfession("prof-1",);

    expect(ctx.selectedProfessionId,).toBeNull();
    expect(ctx.professionsError,).toBeNull();
  });
},);

describeOrSkip("professions.assignProfession", () => {
  test("requires a discipline before posting", async () => {
    const ctx = buildCtx();
    mockChats("actor-1",);
    await ctx.assignProfession();

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.professionsError,).not.toBeNull();
  });

  test("POSTs { actorId, discipline } and reloads", async () => {
    const ctx = buildCtx({ assignDiscipline: "smithing", },);
    let assignBody: unknown = null;
    let assignPosts = 0;
    fetchHandler = (url, opts,) => {
      if (url === "/api/rpg/professions" && opts.method === "POST") {
        assignPosts++;
        assignBody = JSON.parse(opts.body as string,);
        return new Response("{}", { status: 201, },);
      }

      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url === "/api/rpg/professions/actors/actor-1") { return Response.json({ professions: [], },); }
      return new Response("{}", { status: 500, },);
    };

    await ctx.assignProfession();

    expect(assignPosts,).toBe(1,);
    expect(assignBody,).toEqual({ actorId: "actor-1", discipline: "smithing", },);
    expect(ctx.assignDiscipline,).toBe("",);
    expect(ctx.assignBusy,).toBe(false,);
  });
},);

describeOrSkip("professions.addProfessionXp", () => {
  test("POSTs { amount: PROFESSION_XP_STEP } and surfaces level-up + title feedback", async () => {
    const ctx = buildCtx({ professions: [PROFESSION,], },);
    let body: unknown = null;
    fetchHandler = (url, opts,) => {
      if (url === "/api/rpg/professions/prof-1/xp") {
        body = JSON.parse(opts.body as string,);
        return Response.json({ leveledUp: true, newLevel: 31, newTitle: "journeyman", titleChanged: false, },);
      }

      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url === "/api/rpg/professions/actors/actor-1") { return Response.json({ professions: [PROFESSION,], },); }
      return new Response("{}", { status: 500, },);
    };

    await ctx.addProfessionXp("prof-1",);

    expect(body,).toEqual({ amount: PROFESSION_XP_STEP, },);
    expect(ctx.professionsBusyId,).toBeNull();
    expect(ctx.professionFeedback?.professionId,).toBe("prof-1",);
    expect(ctx.professionFeedback?.newLevel,).toBe(31,);
    expect(ctx.professionFeedback?.titleChanged,).toBe(false,);
  });

  test("refreshes instead of erroring on 404 (stale/hidden row)", async () => {
    const ctx = buildCtx({ professions: [PROFESSION,], },);
    fetchHandler = (url,) => {
      if (url === "/api/rpg/professions/prof-1/xp") { return new Response("{}", { status: 404, },); }
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url === "/api/rpg/professions/actors/actor-1") { return Response.json({ professions: [], },); }
      return new Response("{}", { status: 500, },);
    };

    await ctx.addProfessionXp("prof-1",);

    expect(ctx.professionsError,).toBeNull();
    expect(ctx.professions,).toEqual([],);
  });
},);

describeOrSkip("professions.addProfessionSpecialization", () => {
  test("requires a name before posting", async () => {
    const ctx = buildCtx();
    await ctx.addProfessionSpecialization("prof-1",);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.professionsError,).not.toBeNull();
  });

  test("POSTs { name, bonusType, bonusValue } and refreshes the detail", async () => {
    const ctx = buildCtx({ specDraft: { name: "Catalyst Mastery", bonusType: "speed", bonusValue: 10, }, },);
    let body: unknown = null;
    fetchHandler = (url, opts,) => {
      if (url === "/api/rpg/professions/prof-1/specialize") {
        body = JSON.parse(opts.body as string,);
        return Response.json({ ok: true, },);
      }

      if (url === "/api/rpg/professions/prof-1") {
        return Response.json({ ...PROFESSION, specializations: [], },);
      }

      return new Response("{}", { status: 500, },);
    };

    await ctx.addProfessionSpecialization("prof-1",);

    expect(body,).toEqual({ name: "Catalyst Mastery", bonusType: "speed", bonusValue: 10, },);
    expect(ctx.specDraft.name,).toBe("",);
    expect(ctx.professionsBusyId,).toBeNull();
  });
},);

describeOrSkip("professions.assignableDisciplines", () => {
  test("excludes already-held disciplines", () => {
    const ctx = buildCtx({ professions: [PROFESSION,], },);
    const assignable = ctx.assignableDisciplines();

    expect(assignable,).not.toContain("alchemy",);
    expect(assignable,).toContain("smithing",);
    expect(assignable.length,).toBe(PROFESSION_DISCIPLINES.length - 1,);
  });
},);
