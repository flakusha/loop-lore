// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { buildFractalState, } from "./fractal-locations";
import type { FractalState, } from "./fractal-locations";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

const globalState = globalThis as unknown as { apiFetch?: ApiFetchMock };
const originalFetch = globalState.apiFetch;
const originalBareFetch = (globalThis as { fetch?: unknown }).fetch;

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({ data: [], },);

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({ data: [], },);
  globalState.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  (globalThis as any).fetch = (url: any, opts: any,) => {
    calls.push({ url: String(url,), opts, },);
    return handler(String(url,), opts,);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  (globalThis as { fetch?: unknown }).fetch = originalBareFetch;
},);

describe("buildFractalState factory", () => {
  test("initializes fields from worldId", () => {
    const s = buildFractalState("w1",);
    expect(s.worldId,).toBe("w1",);
    expect(s.tree,).toEqual([],);
    expect(s.routes,).toEqual([],);
    expect(s.loadingTree,).toBe(false,);
    expect(s.loadingRoutes,).toBe(false,);
    expect(s.loadedTree,).toBe(false,);
    expect(s.loadedRoutes,).toBe(false,);
    expect(s.error,).toBe(false,);
    expect(s.newRoute,).toEqual({ name: "", kind: "sea", loop: false, secondsPerUnit: 60, },);
    expect(s.selectedRouteId,).toBe("",);
    expect(s.routeDetail,).toBeNull();
    expect(s.flatLocations,).toEqual([],);
  });
});

describe("flatLocations getter", () => {
  test("flattens tree with indentation and depth", () => {
    const s = buildFractalState("w1",);
    s.tree = [
      {
        id: "a",
        name: "Root",
        parent_location_id: null,
        children: [
          { id: "b", name: "Child", parent_location_id: "a", children: [], },
          {
            id: "c",
            name: "Child2",
            parent_location_id: "a",
            children: [
              { id: "d", name: "Grand", parent_location_id: "c", children: [], },
            ],
          },
        ],
      },
    ] as unknown as FractalState["tree"];

    expect(s.flatLocations,).toEqual([
      { id: "a", label: "Root", depth: 0, },
      { id: "b", label: "— Child", depth: 1, },
      { id: "c", label: "— Child2", depth: 1, },
      { id: "d", label: "— — Grand", depth: 2, },
    ],);
  });
});

describe("loadRoutes auto-select", () => {
  test("auto-selects routes[0] when none selected", async () => {
    handler = async (url,) => {
      if (url.includes("/travel-routes/r1",)) {
        return Response.json({
          data: { id: "r1", name: "R", kind: "sea", loop: false, seconds_per_unit: 60, stops: [], },
        },);
      }

      return Response.json({ data: [{ id: "r1", name: "R", kind: "sea", loop: 0, seconds_per_unit: 60, },], },);
    };

    const s = buildFractalState("w1",);
    await s.loadRoutes();
    expect(s.routes.length,).toBe(1,);
    expect(s.loadedRoutes,).toBe(true,);
    expect(s.selectedRouteId,).toBe("r1",);
    expect(s.routeDetail,).not.toBeNull();
  });

  test("does not overwrite existing selectedRouteId", async () => {
    handler = async () =>
      Response.json({ data: [{ id: "r1", name: "R", kind: "sea", loop: 0, seconds_per_unit: 60, },], },);

    const s = buildFractalState("w1",);
    s.selectedRouteId = "existing";
    await s.loadRoutes();
    expect(s.selectedRouteId,).toBe("existing",);
  });
});

describe("createRoute", () => {
  test("trims name and resets draft on success", async () => {
    const s = buildFractalState("w1",);
    s.newRoute = { name: "  New Route  ", kind: "air", loop: true, secondsPerUnit: 30, };
    handler = async (_url, opts,) => {
      if (opts?.method === "POST") { return new Response(null, { status: 201, },); }
      return Response.json({ data: [], },);
    };

    await s.createRoute();
    expect(s.newRoute,).toEqual({ name: "", kind: "sea", loop: false, secondsPerUnit: 60, },);
    const post = calls.find((c,) => c.opts?.method === "POST");
    expect(post,).toBeTruthy();
    const body = JSON.parse(post!.opts!.body as string,);
    expect(body.name,).toBe("New Route",);
  });

  test("does nothing when name empty after trim", async () => {
    const s = buildFractalState("w1",);
    s.newRoute = { name: "   ", kind: "sea", loop: false, secondsPerUnit: 60, };
    await s.createRoute();
    expect(calls.length,).toBe(0,);
  });
});
