import { describe, expect, it, } from "bun:test";
import { createUnifiedSearchService, } from "./service";
import { type SearchHit, SearchTimeoutError, type TierProvider, } from "./types";

function provider(hits: SearchHit[],): TierProvider {
  return async () => hits;
}

function gatedProvider(hits: SearchHit[], gate: Promise<void>,): TierProvider {
  return async () => {
    await gate;
    return hits;
  };
}

function hit(id: string, score: number, source: SearchHit["source"] = "fts",): SearchHit {
  return { id, score, source, payload: { id, }, };
}

const scope = { kind: "messages", userId: "u1", } as const;

describe("search/service (mode dispatch)", () => {
  it("empty query short-circuits without touching providers", async () => {
    let calls = 0;
    const svc = createUnifiedSearchService({
      providers: {
        keyword: async () => {
          calls += 1;
          return [];
        },
        vector: provider([],),
      },
      timeCaps: { global: { defaultMs: 500, maxMs: 1000, }, },
    },);
    await expect(svc.search({ q: "   ", mode: "keyword", }, scope,),).resolves.toEqual([],);
    expect(calls,).toBe(0,);
  });
  it("falls back to keyword when the mode provider is missing", async () => {
    const svc = createUnifiedSearchService({
      providers: { keyword: provider([hit("k1", 0.9,),],), vector: provider([],), },
      timeCaps: { global: { defaultMs: 500, maxMs: 1000, }, },
    },);
    const hits = await svc.search({ q: "tavern", mode: "fuzzy", }, scope,);
    expect(hits.map((h,) => h.id),).toEqual(["k1",],);
  });
  it("hybrid fuses keyword and vector, honoring topK and minScore", async () => {
    const svc = createUnifiedSearchService({
      providers: {
        keyword: provider([hit("a", 0.9,), hit("b", 0.2,),],),
        vector: provider([hit("a", 0.8,), hit("c", 0.7,),],),
      },
      timeCaps: { global: { defaultMs: 500, maxMs: 1000, }, },
    },);
    const hits = await svc.search({ q: "tavern", mode: "hybrid", topK: 2, }, scope,);
    expect(hits,).toHaveLength(2,);
    expect(hits[0]?.id,).toBe("a",);
    const floored = await svc.search({ q: "tavern", mode: "keyword", minScore: 0.5, }, scope,);
    expect(floored.every((h,) => h.score >= 0.5),).toBe(true,);
  });
  it("a failing tier degrades instead of failing the query", async () => {
    const failing: TierProvider = async () => {
      throw new Error("fts down",);
    };
    const svc = createUnifiedSearchService({
      providers: { keyword: failing, vector: provider([hit("v1", 0.6,),],), },
      timeCaps: { global: { defaultMs: 500, maxMs: 1000, }, },
    },);
    const hits = await svc.search({ q: "tavern", mode: "hybrid", }, scope,);
    expect(hits.map((h,) => h.id),).toEqual(["v1",],);
  });
  it("slow queries throw SearchTimeoutError carrying partial tier hits", async () => {
    // Gate never opens: the vector tier pends while the keyword tier settles,
    // so the service's own cap fires with the fast tier's hits as partial.
    const { promise: gate, } = Promise.withResolvers<void>();
    const svc = createUnifiedSearchService({
      providers: {
        keyword: provider([hit("fast", 0.9,),],),
        vector: gatedProvider([hit("slow", 0.8,),], gate,),
      },
      timeCaps: { global: { defaultMs: 20, maxMs: 20, }, },
    },);
    const err = await svc.search({ q: "tavern", mode: "hybrid", }, scope,).catch((e,) => e);
    expect(err,).toBeInstanceOf(SearchTimeoutError,);
    expect(err.partial.map((h: SearchHit,) => h.id),).toEqual(["fast",],);
  });
});
