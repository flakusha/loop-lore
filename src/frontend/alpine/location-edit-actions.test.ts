// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { locationEditActions, type LocationEditHost, } from "./location-edit-actions";

// Bare-global apiFetch/showToast pattern (mirrors world-locations.test.ts).
const g = globalThis as unknown as {
  apiFetch?: (url: string | URL, opts?: RequestInit,) => Promise<Response>;
  showToast?: (...args: unknown[]) => void;
};

const originalApiFetch = g.apiFetch;
const originalShowToast = g.showToast;

let fetchHandler: ((url: string, opts?: RequestInit,) => Response) | null = null;
let toasts: Array<{ kind: string; msg: string }> = [];

function host(overrides?: Partial<LocationEditHost>,): LocationEditHost {
  return {
    worldId: "w1",
    expandedLoc: "",
    locations: [
      { id: "l1", name: "Old", description: "desc", },
      { id: "l2", name: "Keep", description: null, },
    ],
    editLocName: "",
    editLocDesc: "",
    loadLocations: async () => {},
    ...overrides,
  };
}

beforeEach(() => {
  fetchHandler = null;
  toasts = [];
  g.apiFetch = async (url: string | URL, opts?: RequestInit,) => {
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,), opts,);
  };

  g.showToast = (kind: unknown, msg: unknown,) => {
    toasts.push({ kind: String(kind,), msg: String(msg,), },);
  };
},);

afterEach(() => {
  fetchHandler = null;
  g.apiFetch = originalApiFetch;
  g.showToast = originalShowToast;
},);

describe("locationEditActions.expandLoc", () => {
  test("primes edit fields and toggles closed on re-select", () => {
    const c = host();
    locationEditActions.expandLoc.call(c, "l1",);
    expect(c.expandedLoc,).toBe("l1",);
    expect(c.editLocName,).toBe("Old",);
    expect(c.editLocDesc,).toBe("desc",);

    locationEditActions.expandLoc.call(c, "l1",);
    expect(c.expandedLoc,).toBe("",);
  });

  test("unknown id just expands without priming", () => {
    const c = host();
    locationEditActions.expandLoc.call(c, "nope",);
    expect(c.expandedLoc,).toBe("nope",);
    expect(c.editLocName,).toBe("",);
  });
});

describe("locationEditActions.saveLocation", () => {
  test("PUTs the trimmed edit and updates the row in place", async () => {
    fetchHandler = () => Response.json({},);
    const c = host();
    c.expandedLoc = "l1";
    c.editLocName = "  Renamed  ";
    c.editLocDesc = "  new desc  ";

    await locationEditActions.saveLocation.call(c, "l1",);

    expect(c.locations[0],).toEqual({ id: "l1", name: "Renamed", description: "new desc", },);
    expect(c.expandedLoc,).toBe("",);
    expect(toasts[0],).toMatchObject({ kind: "success", },);
  });

  test("network failure keeps the editor state and toasts an error", async () => {
    g.apiFetch = async () => {
      throw new Error("offline",);
    };

    const c = host();
    c.expandedLoc = "l1";
    c.editLocName = "Renamed";

    await locationEditActions.saveLocation.call(c, "l1",);

    expect(c.locations[0]!.name,).toBe("Old",);
    expect(c.expandedLoc,).toBe("l1",);
    expect(toasts[0],).toMatchObject({ kind: "error", },);
  });
});
