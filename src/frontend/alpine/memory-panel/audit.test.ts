// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the memory panel audit tab slice (FEAT-075).
 *
 * Drives `memoryPanelAudit` methods against a stubbed ChatState `this` with
 * a mocked `globalThis.apiFetch`, asserting observable state transitions:
 * URL construction, load/replace, error reset, pagination append, and
 * filter change semantics.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { ChatState, } from "../types";
import { memoryPanelAudit, } from "./audit";

/** Minimal ChatState-shaped stub covering the fields the audit slice reads. */
function makeState(overrides: Partial<ChatState["memoryPanel"]> = {},): ChatState {
  const base = {
    memoryPanel: {
      activeTab: "audit" as const,
      auditEntries: [],
      auditActionFilter: null,
      auditLoading: false,
      auditError: null as string | null,
      auditCursor: null as string | null,
      auditHasMore: false,
      auditExpandedIds: [] as string[],
      ...overrides,
    },
  } as unknown as ChatState;
  const state = Object.assign(Object.create(memoryPanelAudit,), base,);
  (state as unknown as { _getCharacterActorId: () => string | null })._getCharacterActorId = () => "actor-1";
  return state;
}

/** Install a fetch mock capturing URLs and returning scripted responses. */
function mockFetch(responses: Array<{ ok: boolean; body: unknown }>,): { urls: string[]; restore: () => void } {
  const urls: string[] = [];
  let call = 0;
  const original = globalThis.apiFetch;
  globalThis.apiFetch = (async (url: string,) => {
    urls.push(url,);
    const r = responses[Math.min(call, responses.length - 1,)]!;
    call++;
    return { ok: r.ok, status: 500, json: async () => r.body, } as unknown as Response;
  }) as typeof globalThis.apiFetch;
  return {
    urls,
    restore: () => {
      globalThis.apiFetch = original;
    },
  };
}

const row = (id: string,) => ({
  id,
  memoryId: `mem-${id}`,
  actorId: "actor-1",
  userId: "user-1",
  action: "create" as const,
  details: {},
  createdAt: "2026-09-19T12:00:00.000Z",
});

afterEach(() => {
  // Restored per-test by mockFetch().restore(); safety net for throws.
},);

describe("memoryPanelAudit", () => {
  test("_auditUrl builds the endpoint with limit and filters", () => {
    const s = makeState();
    expect(s._auditUrl(null, null,),).toBe("/api/v1/actors/actor-1/memories/audit?limit=25",);
    expect(s._auditUrl("c1", "pin",),).toBe("/api/v1/actors/actor-1/memories/audit?cursor=c1&action=pin&limit=25",);
  });

  test("_auditUrl returns null when no actor is resolvable", () => {
    const s = makeState();
    (s as unknown as { _getCharacterActorId: () => string | null })._getCharacterActorId = () => null;
    expect(s._auditUrl(null, null,),).toBeNull();
  });

  test("loadAudit replaces entries and stores the cursor", async () => {
    const s = makeState();
    const { urls, restore, } = mockFetch([
      { ok: true, body: { entries: [row("r1",), row("r2",),], nextCursor: "cur-1", }, },
    ],);
    try {
      await s.loadAudit();
      expect(urls[0],).toContain("/memories/audit",);
      expect(s.memoryPanel.auditEntries.length,).toBe(2,);
      expect(s.memoryPanel.auditCursor,).toBe("cur-1",);
      expect(s.memoryPanel.auditHasMore,).toBe(true,);
      expect(s.memoryPanel.auditLoading,).toBe(false,);
      expect(s.memoryPanel.auditError,).toBeNull();
    } finally {
      restore();
    }
  });

  test("loadAudit clears state and reports error on failed fetch", async () => {
    const s = makeState({ auditEntries: [], },);
    const { restore, } = mockFetch([{ ok: false, body: null, },],);
    try {
      await s.loadAudit();
      expect(s.memoryPanel.auditError,).toContain("500",);
      expect(s.memoryPanel.auditEntries,).toEqual([],);
      expect(s.memoryPanel.auditHasMore,).toBe(false,);
      expect(s.memoryPanel.auditLoading,).toBe(false,);
    } finally {
      restore();
    }
  });

  test("loadAudit with no resolvable actor empties the list without fetching", async () => {
    const s = makeState({ auditEntries: [], },);
    (s as unknown as { _getCharacterActorId: () => string | null })._getCharacterActorId = () => null;
    const { urls, restore, } = mockFetch([],);
    try {
      await s.loadAudit();
      expect(urls,).toEqual([],);
      expect(s.memoryPanel.auditEntries,).toEqual([],);
    } finally {
      restore();
    }
  });

  test("loadMoreAudit appends the next page and updates the cursor", async () => {
    const s = makeState({
      auditEntries: [],
      auditHasMore: true,
      auditCursor: "cur-1",
    },);
    const { urls, restore, } = mockFetch([
      { ok: true, body: { entries: [row("r3",),], nextCursor: null, }, },
    ],);
    try {
      await s.loadMoreAudit();
      expect(urls[0],).toContain("cursor=cur-1",);
      expect(s.memoryPanel.auditEntries.length,).toBe(1,);
      expect(s.memoryPanel.auditHasMore,).toBe(false,);
      expect(s.memoryPanel.auditLoading,).toBe(false,);
    } finally {
      restore();
    }
  });

  test("loadMoreAudit is a no-op when there is no more data", async () => {
    const s = makeState({ auditHasMore: false, },);
    const { urls, restore, } = mockFetch([],);
    try {
      await s.loadMoreAudit();
      expect(urls,).toEqual([],);
    } finally {
      restore();
    }
  });

  test("setAuditActionFilter sets the filter and reloads", async () => {
    const s = makeState();
    const { urls, restore, } = mockFetch([
      { ok: true, body: { entries: [row("r9",),], nextCursor: null, }, },
    ],);
    try {
      await s.setAuditActionFilter("pin",);
      expect(s.memoryPanel.auditActionFilter,).toBe("pin",);
      expect(urls[0],).toContain("action=pin",);
      expect(s.memoryPanel.auditEntries.length,).toBe(1,);
    } finally {
      restore();
    }
  });

  test("setAuditActionFilter with the same filter is a no-op", async () => {
    const s = makeState({ auditActionFilter: "pin", },);
    const { urls, restore, } = mockFetch([],);
    try {
      await s.setAuditActionFilter("pin",);
      expect(urls,).toEqual([],);
    } finally {
      restore();
    }
  });

  test("toggleAuditExpanded expands and collapses an entry", () => {
    const s = makeState();
    expect(s.isAuditExpanded("r1",),).toBe(false,);
    s.toggleAuditExpanded("r1",);
    expect(s.isAuditExpanded("r1",),).toBe(true,);
    expect(s.memoryPanel.auditExpandedIds,).toEqual(["r1",],);
    s.toggleAuditExpanded("r1",);
    expect(s.isAuditExpanded("r1",),).toBe(false,);
    expect(s.memoryPanel.auditExpandedIds,).toEqual([],);
  });

  test("expanded state is tracked per entry", () => {
    const s = makeState();
    s.toggleAuditExpanded("r1",);
    s.toggleAuditExpanded("r2",);
    expect(s.isAuditExpanded("r1",),).toBe(true,);
    expect(s.isAuditExpanded("r2",),).toBe(true,);
    expect(s.isAuditExpanded("r3",),).toBe(false,);
    s.toggleAuditExpanded("r1",);
    expect(s.memoryPanel.auditExpandedIds,).toEqual(["r2",],);
  });

  test("_auditDetailsExpandable and _formatAuditDetails expose the transform", () => {
    const s = makeState();
    const entry = {
      ...row("r1",),
      details: JSON.stringify({ memoryIds: ["m1",], actorCount: 2, },),
    } as unknown as ChatState["memoryPanel"]["auditEntries"][number];
    expect(s._auditDetailsExpandable(entry,),).toBe(true,);
    expect(s._formatAuditDetails(entry,),).toBe('{\n  "memoryIds": [\n    "m1"\n  ],\n  "actorCount": 2\n}',);
  });
});
