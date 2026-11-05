// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { fetchNpcState, putNpcState, } from "./npc-state-api";
import type { NpcStateRow, } from "./types";

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

const ROW: NpcStateRow = {
  id: "npc-1",
  actor_id: "actor-1",
  world_id: "world-1",
  location_id: null,
  health: 80,
  mental_state: "calm",
  knowledge: "",
  relationships: "",
  schedule: "",
  updated_at: "2026-01-01",
};

describeOrSkip("fetchNpcState", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("returns the row on success", async () => {
    fetchHandler = () => Response.json(ROW,);
    expect(await fetchNpcState("world-1", "actor-1",),).toEqual(ROW,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/world-1/npc-states/actor-1",);
  });

  test("returns null on non-ok", async () => {
    fetchHandler = () => new Response("{}", { status: 404, },);
    await expect(fetchNpcState("world-1", "missing",),).resolves.toBeNull();
  });

  test("returns null on network error", async () => {
    fetchHandler = () => {
      throw new Error("network",);
    };

    await expect(fetchNpcState("world-1", "actor-1",),).resolves.toBeNull();
  });
},);

describeOrSkip("putNpcState", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("PUTs the patch and returns the written row", async () => {
    fetchHandler = () => Response.json({ data: ROW, },);
    const row = await putNpcState("world-1", "actor-1", { health: 90, },);
    expect(row,).toEqual(ROW,);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/worlds/world-1/npc-states/actor-1",);
    expect(fetchCalls[0]?.opts?.method,).toBe("PUT",);
  });

  test("returns null on non-ok", async () => {
    fetchHandler = () => new Response("{}", { status: 400, },);
    await expect(putNpcState("world-1", "actor-1", { health: 90, },),).resolves.toBeNull();
  });

  test("returns null on network error", async () => {
    fetchHandler = () => {
      throw new Error("network",);
    };

    await expect(putNpcState("world-1", "actor-1", { health: 90, },),).resolves.toBeNull();
  });
},);
