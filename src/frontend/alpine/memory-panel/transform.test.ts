// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { AuditEntry, MemoryEntry, MemoryPanelState, } from "../types";
import {
  AUDIT_ACTIONS,
  auditActionIcon,
  auditActionLabel,
  auditDetailsExpandable,
  auditEntriesForFilter,
  formatAuditDate,
  formatAuditDetails,
  formatMemoryDate,
  injectAuditKinds,
  memoriesForTab,
  parseAuditDetails,
  parseMemoryKeywords,
  toAuditEntry,
  toMemoryEntry,
} from "./transform";

describe("audit transform", () => {
  test("toAuditEntry maps the API row to the panel AuditEntry shape", () => {
    const row = {
      id: "row-1",
      memoryId: "mem-1",
      actorId: "actor-1",
      userId: "user-1",
      action: "create" as const,
      details: { source: "extraction", },
      createdAt: "2026-09-19T12:00:00.000Z",
    };
    const entry = toAuditEntry(row,);
    expect(entry,).toEqual({
      id: "row-1",
      memoryId: "mem-1",
      actorId: "actor-1",
      userId: "user-1",
      action: "create",
      details: '{"source":"extraction"}',
      createdAt: "2026-09-19T12:00:00.000Z",
    },);
  });

  test("toAuditEntry accepts null userId", () => {
    const entry = toAuditEntry({
      id: "row-2",
      memoryId: "mem-2",
      actorId: "actor-2",
      userId: null,
      action: "pin",
      details: {},
      createdAt: "2026-09-19T12:00:00.000Z",
    },);
    expect(entry.userId,).toBeNull();
    expect(entry.action,).toBe("pin",);
  });

  test("AUDIT_ACTIONS lists every documented action", () => {
    expect(AUDIT_ACTIONS,).toEqual([
      "create",
      "modify",
      "pin",
      "unpin",
      "decay",
      "purge",
      "inject",
      "delete",
    ],);
  });

  test("auditActionLabel returns a human-readable string for every action", () => {
    for (const action of AUDIT_ACTIONS) {
      const label = auditActionLabel(action,);
      expect(typeof label,).toBe("string",);
      expect(label.length,).toBeGreaterThan(0,);
    }
  });

  test("auditActionIcon returns a non-empty string for every action", () => {
    for (const action of AUDIT_ACTIONS) {
      const icon = auditActionIcon(action,);
      expect(typeof icon,).toBe("string",);
      expect(icon.length,).toBeGreaterThan(0,);
    }
  });

  test("auditActionIcon maps each action to a distinct icon", () => {
    const icons = AUDIT_ACTIONS.map((action,) => auditActionIcon(action,));
    expect(new Set(icons,).size,).toBe(AUDIT_ACTIONS.length,);
  });

  test("auditDetailsExpandable is true only for non-empty details", () => {
    expect(auditDetailsExpandable({ ...mkEntry("create",), details: '{"a":1}', },),).toBe(true,);
    expect(auditDetailsExpandable({ ...mkEntry("create",), details: "", },),).toBe(false,);
    expect(auditDetailsExpandable({ ...mkEntry("create",), details: "   ", },),).toBe(false,);
  });

  test("formatAuditDetails pretty-prints valid JSON", () => {
    expect(formatAuditDetails('{"a":1,"b":[2,3]}',),).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',);
  });

  test("formatAuditDetails falls back to the raw text for malformed JSON", () => {
    expect(formatAuditDetails("not-json",),).toBe("not-json",);
  });

  test("formatAuditDetails returns an empty string for empty input", () => {
    expect(formatAuditDetails("",),).toBe("",);
    expect(formatAuditDetails("   ",),).toBe("",);
  });

  test("formatAuditDate returns empty string for invalid input", () => {
    expect(formatAuditDate("not-a-date",),).toBe("",);
    expect(formatAuditDate("",),).toBe("",);
  });

  test("formatAuditDate renders locale date+time for valid ISO", () => {
    const out = formatAuditDate("2026-09-19T12:34:00.000Z",);
    expect(out,).not.toBe("",);
    expect(out,).toContain("2026",);
    expect(out,).toMatch(/:\d{2}/,);
  });

  test("parseAuditDetails returns {} for empty/malformed input", () => {
    expect(parseAuditDetails("",),).toEqual({},);
    expect(parseAuditDetails("not-json",),).toEqual({},);
    expect(parseAuditDetails("[]",),).toEqual({},);
  });

  test("parseAuditDetails returns parsed object for valid JSON", () => {
    expect(parseAuditDetails('{"k":1}',),).toEqual({ k: 1, },);
  });

  test("auditEntriesForFilter returns all entries when filter is null", () => {
    const entries: AuditEntry[] = [
      mkEntry("create",),
      mkEntry("pin",),
      mkEntry("delete",),
    ];
    expect(auditEntriesForFilter(entries, null,),).toEqual(entries,);
  });

  test("auditEntriesForFilter returns only matching entries", () => {
    const entries: AuditEntry[] = [
      mkEntry("create",),
      mkEntry("pin",),
      mkEntry("create",),
      mkEntry("delete",),
    ];
    const filtered = auditEntriesForFilter(entries, "create",);
    expect(filtered,).toHaveLength(2,);
    expect(filtered.every((e,) => e.action === "create"),).toBe(true,);
  });

  test("auditEntriesForFilter returns empty for unmatched filter", () => {
    const entries: AuditEntry[] = [mkEntry("create",), mkEntry("pin",),];
    expect(auditEntriesForFilter(entries, "purge",),).toEqual([],);
  });
});

describe("injectAuditKinds", () => {
  function mkPanel(): MemoryPanelState {
    return {
      activeTab: "audit",
      characterMemories: [],
      assistantMemories: [],
      worldMemories: [],
      auditEntries: [],
      auditCursor: null,
      auditHasMore: false,
      auditLoading: false,
      auditError: null,
      auditExpandedIds: [],
      auditActionFilter: null,
      loading: false,
      error: null,
      searchQuery: "",
      newMemoryContent: "",
      newMemoryType: "episodic",
      showCreateForm: false,
      editingMemoryId: null,
      editMemoryContent: "",
      tokensUsed: 0,
      tokenBudget: 0,
      busy: false,
    };
  }
  function mem(id: string, extractionKind: MemoryEntry["extractionKind"],): MemoryEntry {
    return {
      id,
      content: "x",
      type: "episodic",
      confidence: 1,
      importance: 1,
      keywords: [],
      createdAt: "2026-09-19T12:00:00.000Z",
      scope: "character",
      extractionKind,
    };
  }
  function injectEntry(memoryIds: string[],): AuditEntry {
    return {
      id: "audit-1",
      memoryId: "m",
      actorId: "a",
      userId: null,
      action: "inject",
      details: JSON.stringify({ memoryIds, actorCount: 1, },),
      createdAt: "2026-09-19T12:00:00.000Z",
    };
  }

  test("returns [] for non-inject actions", () => {
    const panel = mkPanel();
    panel.characterMemories = [mem("m1", "manual",),];
    expect(injectAuditKinds(mkEntry("create",), panel,),).toEqual([],);
  });

  test("returns [] when the audit payload has no memoryIds", () => {
    const panel = mkPanel();
    expect(injectAuditKinds(injectEntry([],), panel,),).toEqual([],);
  });

  test("returns [] when no referenced memories are loaded", () => {
    const panel = mkPanel();
    expect(injectAuditKinds(injectEntry(["missing-1", "missing-2",],), panel,),).toEqual([],);
  });

  test("returns distinct extraction kinds for the injected memories", () => {
    const panel = mkPanel();
    panel.characterMemories = [
      mem("m1", "manual",),
      mem("m2", "single_response",),
      mem("m3", "manual",),
    ];
    expect(injectAuditKinds(injectEntry(["m1", "m2", "m3",],), panel,),).toEqual(["manual", "single_response",],);
  });

  test("looks up memories across every tab (character/assistant/world)", () => {
    const panel = mkPanel();
    panel.assistantMemories = [mem("a1", "burst",),];
    panel.worldMemories = [mem("w1", "compaction",),];
    expect(injectAuditKinds(injectEntry(["a1", "w1",],), panel,),).toEqual(["burst", "compaction",],);
  });

  test("skips memories without an extractionKind set", () => {
    const panel = mkPanel();
    panel.characterMemories = [mem("m1", undefined,), mem("m2", "carry_forward",),];
    expect(injectAuditKinds(injectEntry(["m1", "m2",],), panel,),).toEqual(["carry_forward",],);
  });
});

function mkEntry(action: AuditEntry["action"],): AuditEntry {
  return {
    id: "id-" + action + "-" + Math.random(),
    memoryId: "m",
    actorId: "a",
    userId: null,
    action,
    details: "{}",
    createdAt: "2026-09-19T12:00:00.000Z",
  };
}

describe("memory transform", () => {
  test("parseMemoryKeywords parses a JSON string array", () => {
    expect(parseMemoryKeywords('["a","b"]',),).toEqual(["a", "b",],);
  });

  test("parseMemoryKeywords returns [] for an empty string", () => {
    expect(parseMemoryKeywords("",),).toEqual([],);
  });

  test("parseMemoryKeywords returns [] for invalid JSON", () => {
    expect(parseMemoryKeywords("not-json",),).toEqual([],);
  });

  test("parseMemoryKeywords passes through an array input", () => {
    expect(parseMemoryKeywords(["x", "y",],),).toEqual(["x", "y",],);
    expect(parseMemoryKeywords(undefined as unknown as string[],),).toEqual([],);
  });

  test("toMemoryEntry maps fields and surfaces extractionKind", () => {
    const entry = toMemoryEntry({
      id: "m1",
      content: "hello",
      memory_type: "semantic",
      confidence: 0.9,
      importance: 0.1,
      keywords: '["foo"]',
      pinned: true,
      review_status: "approved",
      created_at: "2026-09-19T12:00:00.000Z",
      scope: "character",
      source_chat_id: "c1",
      source_message_ids: '["msg-1","msg-2"]',
      extraction_kind: "compaction",
    }, "assistant",);
    expect(entry.id,).toBe("m1",);
    expect(entry.extractionKind,).toBe("compaction",);
    expect(entry.sourceMessageId,).toBe("msg-1",);
    expect(entry.pinned,).toBe(true,);
    expect(entry.scope,).toBe("character",);
  });

  test("toMemoryEntry falls back to scopeFallback when scope is missing", () => {
    const entry = toMemoryEntry({
      id: "m1",
      content: "x",
      memory_type: "episodic",
      confidence: 0.5,
      importance: 0.5,
      keywords: [],
      pinned: false,
      review_status: "pending",
      created_at: "2026-09-19",
      source_message_ids: [],
    }, "world",);
    expect(entry.scope,).toBe("world",);
  });

  test("formatMemoryDate returns empty string for invalid timestamps", () => {
    expect(formatMemoryDate("not-a-date",),).toBe("",);
  });

  test("formatMemoryDate renders a locale date for valid ISO", () => {
    const out = formatMemoryDate("2026-09-19T12:00:00.000Z",);
    expect(out,).toBeTruthy();
    expect(out.length,).toBeGreaterThan(0,);
  });

  test("memoriesForTab returns the right slice for each tab", () => {
    const panel: MemoryPanelState = {
      activeTab: "audit",
      characterMemories: [makeMemory("c1", "character",),],
      assistantMemories: [makeMemory("a1", "assistant",),],
      worldMemories: [makeMemory("w1", "world",),],
      auditEntries: [],
      auditCursor: null,
      auditHasMore: false,
      auditLoading: false,
      auditError: null,
      auditExpandedIds: [],
      auditActionFilter: null,
      loading: false,
      error: null,
      searchQuery: "",
      newMemoryContent: "",
      newMemoryType: "episodic",
      showCreateForm: false,
      editingMemoryId: null,
      editMemoryContent: "",
      tokensUsed: 0,
      tokenBudget: 0,
      busy: false,
    };
    expect(memoriesForTab(panel, "character",)[0]?.id,).toBe("c1",);
    expect(memoriesForTab(panel, "assistant",)[0]?.id,).toBe("a1",);
    expect(memoriesForTab(panel, "world",)[0]?.id,).toBe("w1",);
    expect(memoriesForTab(panel, "audit",),).toEqual([],);
  });
});

function makeMemory(id: string, _scope: string,): MemoryEntry {
  return {
    id,
    content: "x",
    type: "episodic",
    confidence: 0.5,
    importance: 0.5,
    keywords: [],
    pinned: false,
    reviewStatus: "pending",
    createdAt: "2026-09-19",
    scope: _scope as MemoryEntry["scope"],
    extractionKind: undefined,
  };
}
