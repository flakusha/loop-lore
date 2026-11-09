import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { adminKnowledgeGraph, projectKnowledgeGraph, } from "./admin-knowledge-graph";

const globalState = globalThis as unknown as {
  apiFetch?: (url: string, opts?: RequestInit,) => Promise<Response>;
  showToast?: (type: string, message: string,) => void;
};

const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
let handler: (url: string,) => Promise<Response> = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];

beforeEach(() => {
  toasts = [];
  handler = async () => Response.json({},);
  globalState.apiFetch = (url,) => handler(url,);
  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
},);

/** Fresh copy of the slice so mutations don't leak between tests. */
function makeState() {
  return { ...adminKnowledgeGraph, kgNodes: [], kgEdges: [], loadingKnowledgeGraph: false, };
}

describe("projectKnowledgeGraph", () => {
  test("positions nodes on a circle and drops edges with unknown endpoints", () => {
    const { nodes, edges, } = projectKnowledgeGraph(
      [
        { id: "asset:1", kind: "asset", label: "a.png", },
        { id: "entity:character:1", kind: "entity", label: "character:1", },
      ],
      [
        { source: "asset:1", target: "entity:character:1", label: null, },
        { source: "asset:1", target: "entity:ghost:9", label: null, },
      ],
    );

    expect(nodes.map((n,) => n.id),).toEqual(["asset:1", "entity:character:1",],);
    expect(nodes.every((n,) => n.fill.startsWith("var(--",)),).toBe(true,);
    expect(edges,).toHaveLength(1,);
    expect(edges[0]!.source,).toBe("asset:1",);
    expect(edges[0]!.target,).toBe("entity:character:1",);
  });

  test("returns empty projections for an empty graph", () => {
    const { nodes, edges, } = projectKnowledgeGraph([], [],);
    expect(nodes,).toEqual([],);
    expect(edges,).toEqual([],);
  });
});

describe("adminKnowledgeGraph.loadKnowledgeGraph", () => {
  test("fetches the endpoint and stores projected nodes/edges", async () => {
    const state = makeState();
    let calledUrl = "";
    handler = async (url,) => {
      calledUrl = url;
      return Response.json({
        nodes: [{ id: "asset:1", kind: "asset", label: "a.png", },],
        edges: [],
      },);
    };

    await state.loadKnowledgeGraph();
    expect(calledUrl,).toBe("/api/v1/memory/knowledge-graph",);
    expect(state.kgNodes,).toHaveLength(1,);
    expect(state.kgEdges,).toEqual([],);
    expect(toasts,).toEqual([],);
    expect(state.loadingKnowledgeGraph,).toBe(false,);
  });

  test("toasts and keeps state empty on error status", async () => {
    const state = makeState();
    handler = async () => new Response("{}", { status: 500, },);
    await state.loadKnowledgeGraph();
    expect(state.kgNodes,).toEqual([],);
    expect(toasts,).toHaveLength(1,);
    expect(toasts[0]!.type,).toBe("error",);
  });

  test("toasts network error when the request rejects", async () => {
    const state = makeState();
    handler = async () => Promise.reject(new Error("offline",),);
    await state.loadKnowledgeGraph();
    expect(toasts,).toHaveLength(1,);
    expect(toasts[0]!.type,).toBe("error",);
    expect(state.loadingKnowledgeGraph,).toBe(false,);
  });
});
