// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { expect, test, } from "bun:test";
import type { IndexEntry, } from "../node_modules/giwt/src/tickets/sync-ticket-types";
import { rankTargets, renderMarkdown, } from "./rsi-target-miner";

/**
 * @param extid - ticket id
 * @param fields - index fields the scoring uses
 * @returns one inline index entry; no fixture file is touched
 */
function entry(
  extid: string,
  fields: { title: string; tags?: string[]; epic?: string; priority?: string; status?: string },
): IndexEntry {
  return {
    hash: extid,
    extid,
    type: "TASK",
    title: fields.title,
    label: "",
    priority: fields.priority ?? "Medium",
    epic: fields.epic ?? "",
    project: "",
    tags: fields.tags ?? [],
    source: extid.toLowerCase(),
    status: fields.status ?? "Not Started",
  };
}

const FIXTURE = {
  "TASK-001": entry("TASK-001", {
    title: "Build RSI target miner",
    tags: ["rsi", "script",],
    epic: "epic-recursive-self-improvement",
    priority: "Critical",
  },),
  "TASK-002": entry("TASK-002", {
    title: "Watchdog admin filters",
    tags: ["tooling", "check",],
    priority: "High",
    status: "In Progress",
  },),
  "TASK-003": entry("TASK-003", {
    title: "Migration runner cleanup",
    tags: ["migration", "tooling",],
    priority: "Critical",
  },),
  "TASK-004": entry("TASK-004", {
    title: "Auth guard refactor",
    tags: ["auth", "security",],
    priority: "High",
  },),
  "TASK-005": entry("TASK-005", { title: "Docs polish", },),
  "TASK-006": entry("TASK-006", {
    title: "RSI automation slice",
    tags: ["rsi", "automation",],
  },),
  "TASK-007": entry("TASK-007", {
    title: "Shipped old RSI slice",
    tags: ["rsi",],
    status: "Done",
  },),
};

test("ranking is stable and closed tickets are excluded", () => {
  const result = rankTargets(FIXTURE,);
  expect(result.ranked.map((t,) => t.extid),).toEqual([
    "TASK-001",
    "TASK-006",
    "TASK-002",
    "TASK-003",
    "TASK-004",
    "TASK-005",
  ],);
  expect(result.counts,).toEqual({ total: 6, autoFileCandidates: 4, humanReview: 2, },);
});

test("migration/auth/secrets targets are human-review only", () => {
  const result = rankTargets(FIXTURE,);
  expect(result.ranked.filter((t,) => t.bucket === "human-review").map((t,) => t.extid),).toEqual([
    "TASK-003",
    "TASK-004",
  ],);
  expect(result.ranked[0]?.reasons,).toContain("rsi-scope",);
});

test("markdown render is sorted and contains no timestamp", () => {
  const markdown = renderMarkdown(rankTargets(FIXTURE,),);
  expect(markdown.indexOf("TASK-001",),).toBeLessThan(markdown.indexOf("TASK-006",),);
  expect(markdown,).not.toMatch(/\d{4}-\d{2}-\d{2}/,);
});
