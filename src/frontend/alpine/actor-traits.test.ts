// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  actorTraits,
  actorTraitsFactory,
  type ActorTraitsState,
  type PermanentTrait,
  TRAIT_CATEGORIES,
} from "./actor-traits";

// ── Mock ../htmx (must precede importing ./actor-traits) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json([],);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

const baseCtx = (): ActorTraitsState => {
  const state = Object.create(actorTraits,) as ActorTraitsState;
  state._trActorId = null;
  state.traits = [];
  state.traitsLoading = false;
  state.traitsError = "";
  state.search = "";
  state.categoryFilter = "";
  state.draft = { category: "personality", name: "", value: "", editingName: null, };
  state.busy = false;
  state.message = "";
  state.error = "";
  return state;
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json([],);
},);

const sampleTrait = (over: Partial<PermanentTrait> = {},): PermanentTrait => ({
  id: "tr-1",
  actor_id: "actor-1",
  trait_category: "personality",
  trait_name: "brave",
  value: "yes",
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("actorTraits.setActorId", () => {
  test("binds and clears prior state", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    expect(ctx._trActorId,).toBe("actor-1",);
    expect(ctx.traits,).toEqual([],);
  });

  test("no-op when actor unchanged", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    ctx.error = "old";
    ctx.setActorId("actor-1",);
    expect(ctx.error,).toBe("old",);
  });
});

describe("actorTraits.loadTraits", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    await ctx.loadTraits();
    expect(calls,).toHaveLength(0,);
  });

  test("populates traits on 200 array", async () => {
    handler = async () => Response.json([sampleTrait(), sampleTrait({ id: "tr-2", trait_name: "wise", },),],);
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    await ctx.loadTraits();
    expect(ctx.traits.length,).toBe(2,);
    expect(ctx.traitsError,).toBe("",);
  });

  test("records error on non-200", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    await ctx.loadTraits();
    expect(ctx.traitsError,).toBeTruthy();
  });

  test("records error on network failure", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    await ctx.loadTraits();
    expect(ctx.traitsError,).toBeTruthy();
  });
});

describe("actorTraits.filteredTraits", () => {
  test("returns all when search empty + filter empty", () => {
    const ctx = baseCtx();
    ctx.traits = [sampleTrait(), sampleTrait({ id: "tr-2", trait_name: "wise", },),];
    expect(ctx.filteredTraits().length,).toBe(2,);
  });

  test("filters by category", () => {
    const ctx = baseCtx();
    ctx.traits = [sampleTrait(), sampleTrait({ id: "tr-2", trait_category: "skill", },),];
    ctx.categoryFilter = "skill";
    expect(ctx.filteredTraits().map((t,) => t.id),).toEqual(["tr-2",],);
  });

  test("filters by case-insensitive name substring", () => {
    const ctx = baseCtx();
    ctx.traits = [sampleTrait(), sampleTrait({ id: "tr-2", trait_name: "Wise", },),];
    ctx.search = "wise";
    expect(ctx.filteredTraits().map((t,) => t.id),).toEqual(["tr-2",],);
  });

  test("matches value substring", () => {
    const ctx = baseCtx();
    ctx.traits = [sampleTrait({ value: "Loud and proud", },), sampleTrait({ id: "tr-2", value: "shy", },),];
    ctx.search = "loud";
    expect(ctx.filteredTraits().map((t,) => t.id),).toEqual(["tr-1",],);
  });
});

describe("actorTraits.startEdit / cancelEdit", () => {
  test("startEdit copies values into draft", () => {
    const ctx = baseCtx();
    ctx.startEdit(sampleTrait({ trait_category: "skill", value: 7, },),);
    expect(ctx.draft.category,).toBe("skill",);
    expect(ctx.draft.name,).toBe("brave",);
    expect(ctx.draft.value,).toBe("7",);
    expect(ctx.draft.editingName,).toBe("brave",);
  });

  test("cancelEdit resets to empty draft", () => {
    const ctx = baseCtx();
    ctx.startEdit(sampleTrait(),);
    ctx.cancelEdit();
    expect(ctx.draft.editingName,).toBeNull();
    expect(ctx.draft.name,).toBe("",);
  });
});

describe("actorTraits.save (create)", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    ctx.draft.name = "loyal";
    await ctx.save();
    expect(calls,).toHaveLength(0,);
  });

  test("errors on missing name", async () => {
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    await ctx.save();
    expect(ctx.error,).toBeTruthy();
    expect(calls,).toHaveLength(0,);
  });

  test("POSTs new trait and reloads", async () => {
    let callIdx = 0;
    handler = async (url: string,) => {
      callIdx++;
      if (callIdx === 1 && url.endsWith("/traits",)) {
        return Response.json({ ok: true, }, { status: 201, },);
      }
      return Response.json([],);
    };
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    ctx.draft.name = "loyal";
    ctx.draft.value = "true";
    await ctx.save();
    const postCall = calls.find((c,) => c.opts.method === "POST");
    expect(postCall?.url,).toBe("/api/v1/actors/actor-1/traits",);
    expect(JSON.parse(String(postCall?.opts.body ?? "{}",),),).toMatchObject({
      trait_category: "personality",
      trait_name: "loyal",
      value: "true",
    },);
    expect(ctx.message,).toBeTruthy();
    expect(ctx.draft.editingName,).toBeNull();
  });

  test("captures server message on non-200", async () => {
    handler = async () => Response.json({ message: "dup", }, { status: 409, },);
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    ctx.draft.name = "loyal";
    await ctx.save();
    expect(ctx.error,).toBe("dup",);
  });
});

describe("actorTraits.save (update)", () => {
  test("PUTs edited trait and reloads", async () => {
    let callIdx = 0;
    handler = async (url: string,) => {
      callIdx++;
      if (callIdx === 1 && url.includes("/traits/brave",)) {
        return Response.json({ ok: true, },);
      }
      return Response.json([],);
    };
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    ctx.startEdit(sampleTrait(),);
    ctx.draft.value = "false";
    await ctx.save();
    const putCall = calls.find((c,) => c.opts.method === "PUT");
    expect(putCall?.url,).toBe("/api/v1/actors/actor-1/traits/brave",);
  });
});

describe("actorTraits.remove", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    await ctx.remove("brave",);
    expect(calls,).toHaveLength(0,);
  });

  test("no-op without name", async () => {
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    await ctx.remove("",);
    expect(calls,).toHaveLength(0,);
  });

  test("DELETEs the trait + reloads + clears draft when editing", async () => {
    let callIdx = 0;
    handler = async (url: string,) => {
      callIdx++;
      if (url.includes("/traits/brave",) && calls[callIdx - 1]?.opts.method === "DELETE") {
        return Response.json({ ok: true, },);
      }
      return Response.json([],);
    };
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    ctx.startEdit(sampleTrait(),);
    await ctx.remove("brave",);
    expect(calls.some((c,) => c.opts.method === "DELETE" && c.url === "/api/v1/actors/actor-1/traits/brave"),).toBe(true,);
    expect(ctx.draft.editingName,).toBeNull();
  });

  test("tolerates 404 (already deleted)", async () => {
    handler = async () => Response.json({}, { status: 404, },);
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    await ctx.remove("missing",);
    expect(ctx.error,).toBe("",);
  });

  test("records error on non-200 non-404", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx._trActorId = "actor-1";
    await ctx.remove("brave",);
    expect(ctx.error,).toBeTruthy();
  });
});

describe("actorTraits.buildPayload", () => {
  test("builds the trait_category/trait_name/value body", () => {
    const ctx = baseCtx();
    ctx.draft.category = "skill";
    ctx.draft.name = "acrobatics";
    ctx.draft.value = "+2";
    expect(ctx.buildPayload(),).toEqual({
      trait_category: "skill",
      trait_name: "acrobatics",
      value: "+2",
    },);
  });
});

describe("actorTraits.describeCategory", () => {
  test("returns human label", () => {
    const ctx = baseCtx();
    expect(ctx.describeCategory("personality",),).toBe("Personality",);
    expect(ctx.describeCategory("skill",),).toBe("Skill",);
  });

  test("falls back to raw code", () => {
    const ctx = baseCtx();
    expect(ctx.describeCategory("unknown_category",),).toBe("unknown_category",);
  });
});

describe("TRAIT_CATEGORIES export", () => {
  test("includes the default categories", () => {
    expect(new Set(TRAIT_CATEGORIES,),).toEqual(
      new Set([
        "personality",
        "physical",
        "background",
        "skill",
        "weakness",
        "custom",
      ],),
    );
  });
});

describe("actorTraitsFactory", () => {
  test("returns a fresh state bound to the actor", () => {
    const a = actorTraitsFactory("actor-a",);
    const b = actorTraitsFactory("actor-b",);
    expect(a,).not.toBe(b,);
    expect(a._trActorId,).toBe("actor-a",);
    expect(b._trActorId,).toBe("actor-b",);
  });
});
