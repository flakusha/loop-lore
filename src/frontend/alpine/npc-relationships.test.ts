// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { ActorRelationshipRow, ActorSummary, } from "./chat-types/npc";
import { npcRelationshipsPanel, } from "./npc-relationships";

// ── Mock the fetchers (the state plugin must stay fetch-agnostic) ──
let castResult: ActorSummary[] | null;
let rowsResult: ActorRelationshipRow[] | null;
let lastWorldId: string | undefined;
let castCalls = 0;
let rowsCalls = 0;

if (ISOLATED) {
  mock.module("./npc-relationships-api", () => ({
    fetchRelationshipCast: async () => {
      castCalls++;
      return castResult;
    },
    fetchActorRelationships: async (_actorId: string, worldId?: string,) => {
      rowsCalls++;
      lastWorldId = worldId;
      return rowsResult;
    },
  }),);
}

const CAST: ActorSummary[] = [
  { id: "actor-1", display_name: "Aria", },
  { id: "actor-2", display_name: "Borin", },
];

const ROWS: ActorRelationshipRow[] = [
  {
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
  },
  {
    id: "rel-2",
    actorId: "actor-1",
    targetActorId: "actor-missing",
    worldId: null,
    relationshipType: "rival",
    standing: -30,
    trust: -10,
    familiarity: 5,
    isBidirectional: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
  },
];

function resetState(): void {
  npcRelationshipsPanel.cast = [];
  npcRelationshipsPanel.relationships = [];
  npcRelationshipsPanel.relationshipActorId = null;
  npcRelationshipsPanel.loadingRelationships = false;
  npcRelationshipsPanel.relationshipsError = "";
  npcRelationshipsPanel.worldId = undefined;
  castResult = null;
  rowsResult = null;
  lastWorldId = undefined;
  castCalls = 0;
  rowsCalls = 0;
}

describeOrSkip("npcRelationshipsPanel.loadRelationships", () => {
  afterEach(resetState,);

  test("loads the cast once and auto-selects the first actor", async () => {
    castResult = CAST;
    rowsResult = ROWS;
    npcRelationshipsPanel.worldId = "world-1";

    await npcRelationshipsPanel.loadRelationships();
    await npcRelationshipsPanel.loadRelationships();

    expect(npcRelationshipsPanel.cast,).toEqual(CAST,);
    expect(npcRelationshipsPanel.relationshipActorId,).toBe("actor-1",);
    expect(npcRelationshipsPanel.relationships,).toEqual(ROWS,);
    expect(npcRelationshipsPanel.relationshipsError,).toBe("",);
    expect(castCalls,).toBe(1,);
    expect(rowsCalls,).toBe(2,);
    expect(lastWorldId,).toBe("world-1",);
  });

  test("respects a preselected actor", async () => {
    castResult = CAST;
    rowsResult = ROWS;
    npcRelationshipsPanel.relationshipActorId = "actor-2";

    await npcRelationshipsPanel.loadRelationships();

    expect(npcRelationshipsPanel.relationshipActorId,).toBe("actor-2",);
  });

  test("surfaces an error when the cast fetch fails", async () => {
    castResult = null;

    await npcRelationshipsPanel.loadRelationships();

    expect(npcRelationshipsPanel.relationshipsError,).not.toBe("",);
    expect(npcRelationshipsPanel.relationships,).toEqual([],);
    expect(rowsCalls,).toBe(0,);
    expect(npcRelationshipsPanel.loadingRelationships,).toBe(false,);
  });

  test("surfaces an error when the relationship fetch fails", async () => {
    castResult = CAST;
    rowsResult = null;

    await npcRelationshipsPanel.loadRelationships();

    expect(npcRelationshipsPanel.relationshipsError,).not.toBe("",);
    expect(npcRelationshipsPanel.relationships,).toEqual([],);
    expect(npcRelationshipsPanel.loadingRelationships,).toBe(false,);
  });

  test("clears rows without an error when no cast exists", async () => {
    castResult = [];
    rowsResult = ROWS;

    await npcRelationshipsPanel.loadRelationships();

    expect(npcRelationshipsPanel.relationships,).toEqual([],);
    expect(npcRelationshipsPanel.relationshipsError,).toBe("",);
    expect(rowsCalls,).toBe(0,);
  });

  test("passes no world filter when worldId is blank", async () => {
    castResult = CAST;
    rowsResult = ROWS;
    npcRelationshipsPanel.worldId = "";

    await npcRelationshipsPanel.loadRelationships();

    expect(lastWorldId,).toBeUndefined();
  });
},);

describeOrSkip("npcRelationshipsPanel.relationshipRows", () => {
  afterEach(resetState,);

  test("resolves target names from the cast", () => {
    npcRelationshipsPanel.cast = CAST;
    npcRelationshipsPanel.relationships = ROWS;

    const rows = npcRelationshipsPanel.relationshipRows();

    expect(rows,).toHaveLength(2,);
    expect(rows[0],).toEqual({
      id: "rel-1",
      targetName: "Borin",
      type: "friend",
      standing: 75,
      trust: 40,
      familiarity: 60,
      isBidirectional: true,
    },);
  });

  test("labels targets missing from the cast", () => {
    npcRelationshipsPanel.cast = CAST;
    npcRelationshipsPanel.relationships = [ROWS[1]!,];

    const rows = npcRelationshipsPanel.relationshipRows();

    expect(rows[0]?.targetName,).toBe("npc.relationshipsUnknownActor",);
    expect(rows[0]?.isBidirectional,).toBe(false,);
  });

  test("renders empty without rows", () => {
    expect(npcRelationshipsPanel.relationshipRows(),).toEqual([],);
  });
},);
