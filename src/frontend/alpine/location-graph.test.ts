// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import {
  buildLocationGraphState,
  type EditEdgeDraft,
  type LocationGraphState,
} from "./location-graph";

// ── Mock ./htmx and ./world-fetch (must precede importing ./location-graph) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let apiCalls: { url: string; opts: RequestInit }[] = [];
let apiHandler: ApiFetchMock = async () => Response.json({},);

let worldGets: string[] = [];
let worldHandler: (path: string,) => unknown = () => ({ data: [], });

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    apiCalls.push({ url, opts: opts ?? {}, },);
    return apiHandler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

mock.module("./world-fetch", () => ({
  fetchWorldJson: async <T,>(_worldId: string, path: string,): Promise<T | null> => {
    worldGets.push(path,);
    return worldHandler(path,) as T;
  },
}),);

const EDGE = {
  id: "edge-1",
  from_id: "loc-a",
  to_id: "loc-b",
  mode: "walk",
  game_hours: 2,
  requires_discovery: false,
  cost: {},
};

/** @returns a fresh editor state */
function freshState(): LocationGraphState {
  return buildLocationGraphState("world-1",);
}

beforeEach(() => {
  apiCalls = [];
  worldGets = [];
  apiHandler = async () => Response.json({},);
  worldHandler = (path,) => {
    if (path === "/locations/tree") {
      return {
        data: [
          { id: "loc-a", name: "Alpha", children: [], },
          { id: "loc-b", name: "Beta", children: [{ id: "loc-c", name: "Gamma", children: [], },], },
        ],
      };
    }

    if (path === "/edges") { return { data: [EDGE,], }; }
    return { data: [], };
  };
},);

afterEach(() => {
  apiCalls = [];
  worldGets = [];
},);

describe("locationGraphState.load", () => {
  test("flattens tree nodes and decodes the graph", async () => {
    const state = freshState();
    await state.load();

    expect(state.nodes.map((n,) => n.id),).toEqual(["loc-a", "loc-b", "loc-c",],);
    expect(state.nodeNames["loc-c"],).toBe("Gamma",);
    expect(state.edges,).toHaveLength(1,);
    expect(state.edges[0]!.requires_discovery,).toBe(false,);
    expect(state.loaded,).toBe(true,);
    expect(state.error,).toBe(false,);
  });

  test("flags load errors without throwing", async () => {
    worldHandler = () => {
      throw new Error("offline",);
    };

    const state = freshState();
    await state.load();

    expect(state.error,).toBe(true,);
    expect(state.loaded,).toBe(false,);
  });
});

describe("locationGraphState.createEdge", () => {
  test("posts to the origin edge route and reloads", async () => {
    const state = freshState();
    state.newEdge = {
      fromId: "loc-a",
      toId: "loc-b",
      mode: "free-jump",
      gameHours: 3,
      requiresDiscovery: true,
      costJson: '{"gold":5}',
    };

    await state.createEdge();

    const post = apiCalls.find((c,) => c.opts.method === "POST");
    expect(post?.url,).toBe("/api/v1/worlds/world-1/locations/loc-a/edges",);
    const body = JSON.parse(String(post?.opts.body,),) as Record<string, unknown>;
    expect(body,).toEqual({
      toId: "loc-b",
      mode: "free-jump",
      gameHours: 3,
      requiresDiscovery: true,
      cost: { gold: 5, },
    },);
  });

  test("omits cost when blank and no-ops without endpoints", async () => {
    const state = freshState();
    state.newEdge = {
      fromId: "loc-a",
      toId: "loc-b",
      mode: "walk",
      gameHours: 1,
      requiresDiscovery: false,
      costJson: "",
    };

    await state.createEdge();
    const post = apiCalls.find((c,) => c.opts.method === "POST");
    expect(JSON.parse(String(post?.opts.body,),),).not.toHaveProperty("cost",);

    const before = apiCalls.length;
    state.newEdge.fromId = "";
    await state.createEdge();
    expect(apiCalls.length,).toBe(before,);
  });
});

describe("locationGraphState.editing", () => {
  test("startEdit seeds a draft from the edge row", () => {
    const state = freshState();
    state.edges = [{ ...EDGE, requires_discovery: true, cost: { gold: 2, }, },];
    state.startEdit("edge-1",);

    const draft = state.editDrafts["edge-1"];
    expect(draft?.mode,).toBe("walk",);
    expect(draft?.gameHours,).toBe(2,);
    expect(draft?.requiresDiscovery,).toBe(true,);
    expect(draft?.costJson,).toBe('{"gold":2}',);
    expect(state.editDraftOf("edge-1",),).toBe(draft,);
  });

  test("editDraftOf falls back when no draft exists", () => {
    const state = freshState();
    const fallback: EditEdgeDraft = state.editDraftOf("missing",);
    expect(fallback.mode,).toBe("walk",);
  });

  test("saveEdit PUTs the draft and clears it", async () => {
    const state = freshState();
    state.edges = [{ ...EDGE, },];
    state.startEdit("edge-1",);
    state.editDrafts["edge-1"]!.costJson = '{"cooldownHours":2}';

    await state.saveEdit("edge-1",);

    const put = apiCalls.find((c,) => c.opts.method === "PUT");
    expect(put?.url,).toBe("/api/v1/worlds/world-1/edges/edge-1",);
    const body = JSON.parse(String(put?.opts.body,),) as Record<string, unknown>;
    expect(body.cost,).toEqual({ cooldownHours: 2, },);
    expect(state.editDrafts["edge-1"],).toBeUndefined();
  });

  test("deleteEdge DELETEs and clears drafts", async () => {
    const state = freshState();
    state.editDrafts["edge-1"] = { mode: "walk", gameHours: 1, requiresDiscovery: false, costJson: "", };

    await state.deleteEdge("edge-1",);

    const del = apiCalls.find((c,) => c.opts.method === "DELETE");
    expect(del?.url,).toBe("/api/v1/worlds/world-1/edges/edge-1",);
    expect(state.editDrafts["edge-1"],).toBeUndefined();
  });
});

describe("locationGraphState.costLabel", () => {
  test("renders gold, cooldown, item and faction parts", () => {
    const state = freshState();
    expect(state.costLabel({},),).toBe("",);
    expect(state.costLabel({ gold: 5, cooldownHours: 2, itemId: "i1", requiresFactionStanding: "ally", },),).toBe(
      "5g, 2h cd, i1, needs ally",
    );
  });
});
