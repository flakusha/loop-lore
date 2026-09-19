// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { AuditEntry, } from "../types";
import {
  AUDIT_ACTIONS,
  auditActionLabel,
  auditEntriesForFilter,
  formatAuditDate,
  parseAuditDetails,
  toAuditEntry,
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
