// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import type { WorldStateSnapshot, } from "./types";
import { createWorldState, fetchWorldStates, } from "./world-states-api";

// ── Mock ../htmx (must override the real one set by htmx.ts at import) ──
let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: ((url: string,) => Response) | null = null;

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url,);
    },
  }),);
}

const SNAP: WorldStateSnapshot = { id: "ws-1", description: "Town at dawn", };

describeOrSkip("fetchWorldStates", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("returns data and total on success", async () => {
    fetchHandler = () => Response.json({ data: [SNAP,], total: 1, },);
    const result = await fetchWorldStates("world-1",);
    expect(result.data,).toEqual([SNAP,],);
    expect(result.total,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/world-1/states?page=1&pageSize=20",);
  });

  test("degrades to empty on non-ok", async () => {
    fetchHandler = () => new Response("{}", { status: 500, },);
    await expect(fetchWorldStates("world-1",),).resolves.toEqual({ data: [], total: 0, },);
  });

  test("degrades to empty on network error", async () => {
    fetchHandler = () => {
      throw new Error("network",);
    };

    await expect(fetchWorldStates("world-1",),).resolves.toEqual({ data: [], total: 0, },);
  });
},);

describeOrSkip("createWorldState", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("POSTs the input and returns the snapshot id", async () => {
    fetchHandler = () => Response.json({ id: "ws-2", },);
    const id = await createWorldState("world-1", { description: "Dusk", },);
    expect(id,).toBe("ws-2",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/world-1/states",);
    expect(fetchCalls[0]?.opts?.method,).toBe("POST",);
  });

  test("returns null on non-ok", async () => {
    fetchHandler = () => new Response("{}", { status: 400, },);
    await expect(createWorldState("world-1", { description: "Dusk", },),).resolves.toBeNull();
  });

  test("returns null on network error", async () => {
    fetchHandler = () => {
      throw new Error("network",);
    };

    await expect(createWorldState("world-1", { description: "Dusk", },),).resolves.toBeNull();
  });
},);
