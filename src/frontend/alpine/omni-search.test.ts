// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// omni-search.ts uses the ambient apiFetch global (no htmx import), so the
// transport is stubbed by overwriting globalThis.apiFetch. This file OWNS the
// global for the duration of each test and restores it in afterEach — a
// leaked stub would hijack every other suite in this worker.
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { OmniSearchResults, } from "./types";
import "./omni-search";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
const g = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  omniSearch?: () => Record<string, unknown>;
  location?: { assign: (url: string,) => void };
  openAssetPreview?: (id: string,) => Promise<void>;
};

const originalApiFetch = g.apiFetch;
const originalLocation = g.location;
const originalOpenAssetPreview = g.openAssetPreview;

interface SearchState {
  q: string;
  loading: boolean;
  error: boolean;
  queried: string;
  results: OmniSearchResults;
  total(): number;
  run(): Promise<void>;
  openChat(chatId: string,): void;
  openAsset(assetId: string,): void;
}

function fresh(): SearchState {
  return g.omniSearch!() as unknown as SearchState;
}

let calls: string[] = [];
let navCalls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

beforeEach(() => {
  calls = [];
  navCalls = [];
  handler = async () => Response.json({},);
  g.apiFetch = async (url: string, opts?: RequestInit,) => {
    calls.push(url,);
    return handler(url, opts,);
  };

  g.location = {
    assign: (url: string,) => {
      navCalls.push(url,);
    },
  };

  g.openAssetPreview = async () => {};
},);

afterEach(() => {
  g.apiFetch = originalApiFetch;
  g.location = originalLocation;
  g.openAssetPreview = originalOpenAssetPreview;
},);

const body = (): OmniSearchResults => ({
  chats: [{ chatId: "c1", chatName: "Tavern", },],
  messages: [{ messageId: "m1", chatId: "c1", snippet: "…the tavern…", },],
  assets: [{ assetId: "a1", filename: "map.png", matchScore: 0.9, },],
});

describe("omniSearch pure helpers", () => {
  test("total counts hits across the three surfaces", () => {
    const s = fresh();
    s.results = body();
    expect(s.total(),).toBe(3,);
  });

  test("openChat assigns the chat deep link", () => {
    const s = fresh();
    s.openChat("c1",);
    expect(navCalls,).toEqual(["/chat/c1",],);
  });

  test("openAsset opens the asset preview", () => {
    const s = fresh();
    const seen: string[] = [];
    g.openAssetPreview = async (id: string,) => {
      seen.push(id,);
    };

    s.openAsset("a1",);
    expect(seen,).toEqual(["a1",],);
  });
});

describe("omniSearch run", () => {
  test("blank query resets state without fetching", async () => {
    const s = fresh();
    s.q = "   ";
    await s.run();
    expect(calls,).toEqual([],);
    expect(s.loading,).toBe(false,);
    expect(s.error,).toBe(false,);
    expect(s.queried,).toBe("",);
    expect(s.results,).toEqual({ chats: [], messages: [], assets: [], },);
  });

  test("a query fans out to /api/search and stores grouped results", async () => {
    handler = async () => Response.json(body(),);
    const s = fresh();
    s.q = " tavern ";
    await s.run();
    expect(calls,).toEqual(["/api/search?q=tavern",],);
    expect(s.error,).toBe(false,);
    expect(s.loading,).toBe(false,);
    expect(s.queried,).toBe("tavern",);
    expect(s.results.chats,).toHaveLength(1,);
    expect(s.results.messages[0]!.chatId,).toBe("c1",);
    expect(s.results.assets[0]!.filename,).toBe("map.png",);
  });

  test("a failed response flips the error state and clears results", async () => {
    handler = async () => Response.json({ error: "boom", }, { status: 500, },);
    const s = fresh();
    s.q = "tavern";
    await s.run();
    expect(s.error,).toBe(true,);
    expect(s.loading,).toBe(false,);
    expect(s.queried,).toBe("",);
    expect(s.results,).toEqual({ chats: [], messages: [], assets: [], },);
  });

  test("a stale slow response never overwrites a newer one", async () => {
    let releaseFirst: (() => void) | null = null;
    const firstGate = new Promise<void>((resolve,) => {
      releaseFirst = resolve;
    },);

    handler = async (url: string,) => {
      if (url.includes("q=a%20b",)) { return Response.json({ chats: [], messages: [], assets: [], },); }
      await firstGate;
      return Response.json(body(),);
    };

    const s = fresh();
    s.q = "tavern";
    const first = s.run();
    s.q = "a b";
    await s.run();
    releaseFirst!();
    await first;
    expect(s.queried,).toBe("a b",);
    expect(s.results,).toEqual({ chats: [], messages: [], assets: [], },);
    expect(s.loading,).toBe(false,);
  });
});
