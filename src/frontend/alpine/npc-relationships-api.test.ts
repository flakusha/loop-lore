// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { ActorRelationshipRow, } from "./chat-types/npc";
import {
  fetchActorRelationships,
  fetchRelationshipCast,
} from "./npc-relationships-api";

// ── Mock ../htmx (must override the real one set by htmx.ts at import) ──
let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: ((url: string,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url,);
    },
  }),);
}

const ROW: ActorRelationshipRow = {
  id: "rel-1",
  actorId: "actor-1",
  targetActorId: "actor-2",
  worldId: "world-1",
  relationshipType: "friend",
  standing: 75,
  trust: 40,
  familiarity: 60,
  isBidirectional: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
};

describeOrSkip("fetchRelationshipCast", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("returns the actor list on success", async () => {
    fetchHandler = () => Response.json({ data: [{ id: "a1", display_name: "Aria", },], },);
    const cast = await fetchRelationshipCast();
    expect(cast,).toEqual([{ id: "a1", display_name: "Aria", },],);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/actors?pageSize=200",);
  });

  test("returns null on non-ok", async () => {
    fetchHandler = () => new Response("{}", { status: 401, },);
    await expect(fetchRelationshipCast(),).resolves.toBeNull();
  });

  test("returns null on network error", async () => {
    fetchHandler = () => {
      throw new Error("network",);
    };

    await expect(fetchRelationshipCast(),).resolves.toBeNull();
  });
},);

describeOrSkip("fetchActorRelationships", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("returns rows on success and encodes the actor id", async () => {
    fetchHandler = () => Response.json([ROW,],);
    const rows = await fetchActorRelationships("actor/1",);
    expect(rows,).toEqual([ROW,],);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/actors/actor%2F1/relationships",);
  });

  test("narrows to the world when worldId is given", async () => {
    fetchHandler = () => Response.json([ROW,],);
    await fetchActorRelationships("actor-1", "world-1",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/actors/actor-1/relationships?worldId=world-1",);
  });

  test("omits the world filter without worldId", async () => {
    fetchHandler = () => Response.json([ROW,],);
    await fetchActorRelationships("actor-1",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/actors/actor-1/relationships",);
  });

  test("returns null on non-ok", async () => {
    fetchHandler = () => new Response("{}", { status: 500, },);
    await expect(fetchActorRelationships("actor-1",),).resolves.toBeNull();
  });

  test("returns null on network error", async () => {
    fetchHandler = () => {
      throw new Error("network",);
    };

    await expect(fetchActorRelationships("actor-1",),).resolves.toBeNull();
  });
},);
