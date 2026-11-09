// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the world map zones read view: map/zone loading,
 * failure state, point picking against the real zone-at endpoint shape,
 * and SVG markup escaping.
 */
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { worldMapZones, } from "./world-map";
import type { MapWire, WorldMapZonesState, } from "./world-map";

// ── Mock ../fe-fetch (must precede importing ./world-map) ──
type FetchFn = (url: string,) => Response | Promise<Response>;
let fetchFn: FetchFn = async () => Response.json({},);

if (ISOLATED) {
  mock.module("../fe-fetch", () => ({
    feFetch: (async (url: string,) => fetchFn(url,)) satisfies FetchFn,
  }),);
}

const MAP: MapWire = { id: "m1", name: "Overworld", width: 10, height: 6, map_type: "2d", };
const ZONE = {
  id: "z1",
  mapId: "m1",
  locationId: null,
  name: "Forest <1>",
  zoneType: "region",
  x: 1,
  y: 1,
  width: 3,
  height: 2,
  z: 0,
};

function state(): WorldMapZonesState {
  return worldMapZones("w1",) as WorldMapZonesState;
}

afterEach(() => {
  fetchFn = async () => Response.json({},);
},);

describeOrSkip("world-map-zones", () => {
  test("init loads maps and their zones into groups", async () => {
    fetchFn = (url,) => {
      if (url.endsWith("/maps",)) { return Response.json({ data: [MAP,], },); }
      if (url.endsWith("/maps/m1/zones",)) { return Response.json({ data: [ZONE,], },); }
      throw new Error(`unexpected url ${url}`,);
    };

    const s = state();
    await s.init();
    expect(s.loading,).toBe(false,);
    expect(s.loadError,).toBe(false,);
    expect(s.groups.length,).toBe(1,);
    expect(s.groups[0]?.zones[0]?.name,).toBe("Forest <1>",);
  });

  test("init surfaces a load error on non-2xx and network failure", async () => {
    fetchFn = async () => new Response("{}", { status: 500, },);
    const s = state();
    await s.init();
    expect(s.loadError,).toBe(true,);
    expect(s.loading,).toBe(false,);

    fetchFn = async () => {
      throw new TypeError("network down",);
    };

    const s2 = state();
    await s2.init();
    expect(s2.loadError,).toBe(true,);
  });

  test("svgInner escapes zone names and sizes the surface", () => {
    const s = state();
    const inner = s.svgInner({ map: MAP, zones: [ZONE,], },);
    expect(inner,).toContain("Forest &lt;1&gt;",);
    expect(inner,).not.toContain("Forest <1>",);
    expect(inner,).toContain('width="10"',);
  });

  test("pick resolves the zone at the clicked tile", async () => {
    let queried = "";
    fetchFn = async (url,) => {
      queried = url;
      return Response.json({ data: ZONE, },);
    };

    const s = state();
    const target = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 60, }), };
    await s.pick(
      { clientX: 25, clientY: 30, currentTarget: target, } as unknown as MouseEvent,
      { map: MAP, zones: [], },
    );

    expect(queried,).toContain("/maps/m1/zone-at?x=2&y=3&z=0",);
    expect(s.resolvedMap,).toBe("Overworld",);
    expect(s.resolvedZone,).toBe("Forest <1>",);
    expect(s.resolveError,).toBe(false,);
  });

  test("pick reports off-map and error picks", async () => {
    fetchFn = async () => Response.json({ data: null, },);
    const s = state();
    const target = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 60, }), };
    const ev = { clientX: 0, clientY: 0, currentTarget: target, } as unknown as MouseEvent;
    await s.pick(ev, { map: MAP, zones: [], },);
    expect(s.resolvedZone,).toBeNull();
    expect(s.resolveError,).toBe(false,);

    fetchFn = async () => new Response("{}", { status: 500, },);
    await s.pick(ev, { map: MAP, zones: [], },);
    expect(s.resolveError,).toBe(true,);

    fetchFn = async () => {
      throw new TypeError("network down",);
    };

    await s.pick(ev, { map: MAP, zones: [], },);
    expect(s.resolveError,).toBe(true,);
  });
},);
