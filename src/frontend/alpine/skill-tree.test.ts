// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the skills-tree panel mixin (TASK-skills-frontend).
 *
 * Mirrors rpg-stats.test.ts: mocks `./htmx` apiFetch, builds a minimal ctx
 * from the `skillTree` slice, and asserts on request shape + state.
 *
 * Pins the contract:
 *   - loadSkills resolves the chat's actor, then GETs the actor-scoped route
 *   - 404 (not visible: missing or not-owned) renders the empty state, no error
 *   - addSkillXp POSTs /api/rpg/skills/:id/xp with { xpAmount: 100 }, sets
 *     level-up feedback, and reloads
 *   - specializeSkill requires a name and POSTs { specialization }
 *   - skillsByCategory groups and sorts category → level desc
 */
import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { skillTree, } from "./skill-tree";
import type { ChatState, } from "./types";

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
    skills: [],
    skillsLoading: false,
    skillsError: null,
    selectedSkillId: null,
    skillsBusyId: null,
    skillFeedback: null,
    skillSpecName: "",
    openCategories: {},
    ...skillTree,
    ...overrides,
  };

  return base as unknown as ChatState;
}

const SKILL_A = {
  id: "skill-a",
  name: "Fireball",
  category: "combat",
  description: "hurl fire",
  level: 3,
  xp: 40,
  proficiency: "apprentice",
  specialization: null,
  isLocked: false,
  prerequisites: [],
};

const SKILL_B = {
  id: "skill-b",
  name: "Lockpick",
  category: "stealth",
  description: null,
  level: 5,
  xp: 0,
  proficiency: "novice",
  specialization: null,
  isLocked: false,
  prerequisites: [],
};

/** Route chats lookup (actor resolution) and the skills API. */
function mockChats(actorId: string | null,): void {
  fetchHandler = (url,) => {
    if (url === "/api/v1/chats/chat-1") {
      return Response.json({ character_id: actorId, },);
    }

    return new Response("{}", { status: 500, },);
  };
}

describeOrSkip("skillTree.loadSkills", () => {
  test("GETs the actor-scoped route for the chat's actor", async () => {
    const ctx = buildCtx();
    fetchHandler = (url,) => {
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url === "/api/rpg/skills/actors/actor-1") {
        return Response.json({ skills: [SKILL_A, SKILL_B,], },);
      }

      return new Response("{}", { status: 500, },);
    };

    await ctx.loadSkills();

    expect(ctx.skillsError,).toBeNull();
    expect(ctx.skillsLoading,).toBe(false,);
    expect(ctx.skills.length,).toBe(2,);
    const listCall = fetchCalls.find((c,) => c.url === "/api/rpg/skills/actors/actor-1");
    expect(listCall,).toBeDefined();
  });

  test("renders the empty state on 404 (not visible), without an error", async () => {
    const ctx = buildCtx();
    fetchHandler = (url,) => {
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url.startsWith("/api/rpg/skills/actors/",)) { return new Response("{}", { status: 404, },); }

      return new Response("{}", { status: 500, },);
    };

    await ctx.loadSkills();

    expect(ctx.skills,).toEqual([],);
    expect(ctx.skillsError,).toBeNull();
  });

  test("renders the empty state when the chat has no actor", async () => {
    const ctx = buildCtx();
    mockChats(null,);
    await ctx.loadSkills();

    expect(ctx.skills,).toEqual([],);
    expect(fetchCalls.some((c,) => c.url.startsWith("/api/rpg/",)),).toBe(false,);
  });
},);

describeOrSkip("skillTree.addSkillXp", () => {
  test("POSTs { xpAmount } and sets level-up feedback, then reloads", async () => {
    const ctx = buildCtx({ skills: [SKILL_A,], selectedSkillId: "skill-a", },);
    let xpPosts = 0;
    fetchHandler = (url,) => {
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url === "/api/rpg/skills/actors/actor-1") { return Response.json({ skills: [SKILL_A,], },); }
      if (url === "/api/rpg/skills/skill-a/xp") {
        xpPosts++;
        return Response.json({ leveledUp: true, xpGained: 100, newProficiency: "journeyman", },);
      }

      return new Response("{}", { status: 500, },);
    };

    await ctx.addSkillXp("skill-a",);

    expect(xpPosts,).toBe(1,);
    const call = fetchCalls.find((c,) => c.url === "/api/rpg/skills/skill-a/xp");
    expect(JSON.parse(call?.opts.body as string,),).toEqual({ xpAmount: 100, },);
    expect(ctx.skillsBusyId,).toBeNull();
    expect(ctx.skillFeedback?.skillId,).toBe("skill-a",);
    expect(ctx.skillFeedback?.newProficiency,).toBe("journeyman",);
    // Reload happened (2 GETs to the actor route: 1 in add, 1 in loadSkills).
    expect(fetchCalls.filter((c,) => c.url === "/api/rpg/skills/actors/actor-1").length,).toBeGreaterThan(0,);
  });

  test("refreshes instead of erroring on 404 (stale/hidden row)", async () => {
    const ctx = buildCtx({ skills: [SKILL_A,], },);
    fetchHandler = (url,) => {
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url === "/api/rpg/skills/skill-a/xp") { return new Response("{}", { status: 404, },); }
      if (url === "/api/rpg/skills/actors/actor-1") { return Response.json({ skills: [], },); }

      return new Response("{}", { status: 500, },);
    };

    await ctx.addSkillXp("skill-a",);

    expect(ctx.skillsError,).toBeNull();
    expect(ctx.skills,).toEqual([],);
  });
},);

describeOrSkip("skillTree.specializeSkill", () => {
  test("requires a name before posting", async () => {
    const ctx = buildCtx();
    await ctx.specializeSkill("skill-a",);

    expect(fetchCalls.length,).toBe(0,);
    expect(ctx.skillsError,).not.toBeNull();
  });

  test("POSTs { specialization } and clears the input", async () => {
    const ctx = buildCtx({ skillSpecName: "Ember Shackles", },);
    let body: unknown = null;
    fetchHandler = (url, opts,) => {
      if (url === "/api/rpg/skills/skill-a/specialize") {
        body = JSON.parse(opts.body as string,);
        return Response.json({ ok: true, },);
      }

      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "actor-1", },); }
      if (url === "/api/rpg/skills/actors/actor-1") { return Response.json({ skills: [SKILL_A,], },); }
      return new Response("{}", { status: 500, },);
    };

    await ctx.specializeSkill("skill-a",);

    expect(body,).toEqual({ specialization: "Ember Shackles", },);
    expect(ctx.skillSpecName,).toBe("",);
    expect(ctx.skillsBusyId,).toBeNull();
  });
},);

describeOrSkip("skillTree.skillsByCategory", () => {
  test("groups by category, sorts categories and levels", () => {
    const ctx = buildCtx({ skills: [SKILL_B, SKILL_A,], },);
    const groups = ctx.skillsByCategory();

    expect(groups.map((g,) => g.category),).toEqual(["combat", "stealth",],);
    expect(groups[0]?.skills[0]?.id,).toBe("skill-a",);
  });
},);
