// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { ADVISORY_GATES, checks, } from "./check/parallel/gate-table.mjs";
import {
  canon,
  driftOf,
  h1Title,
  headerField,
  LANE_SCOPE,
  laneClaims,
  linkageReport,
  render,
  resolveClaim,
  stripTypePrefix,
} from "./plan-entry-map.js";

/**
 * CLI + gate contract for scripts/plan-entry-map.ts.
 *
 * RESOURCE CONTRACT: each case that needs files owns a fresh mkdtemp dir and
 * removes it in `finally`. No fixed paths, no shared fixtures.
 */

function withDirs(
  fn: (tickets: string, lanes: string, indexPath: string,) => void,
  index: Record<string, unknown> = {},
): void {
  const root = mkdtempSync(join(tmpdir(), "entry-map-",),);
  try {
    const tickets = join(root, "tickets",);
    const lanes = join(root, "lanes",);
    mkdirSync(tickets, { recursive: true, },);
    mkdirSync(lanes, { recursive: true, },);
    const indexPath = join(root, "index.json",);
    writeFileSync(indexPath, JSON.stringify(index,),);
    fn(tickets, lanes, indexPath,);
  } finally {
    rmSync(root, { recursive: true, force: true, },);
  }
}

const ticketMd = (scope = LANE_SCOPE,) =>
  [
    "# TASK: demo ticket",
    "",
    "**Status:** In Progress",
    `**Scope:** ${scope}`,
    "**Priority:** medium",
    "**Epic:** epic-demo",
    "",
    "Body.",
  ].join("\n",);

describe("canon + stripTypePrefix", () => {
  test("folds case, hyphens, and spaces", () => {
    expect(canon("Plan-Map.md entry MAP",),).toBe("plan map md entry map",);
    expect(canon(undefined,),).toBe("",);
  });
  test("strips TYPE prefixes", () => {
    expect(stripTypePrefix("TASK: demo ticket",),).toBe("demo ticket",);
    expect(stripTypePrefix("BUG-plan-ticket-status",),).toBe("plan-ticket-status",);
    expect(stripTypePrefix("plain title",),).toBe("plain title",);
  });
});

describe("headerField + h1Title", () => {
  test("reads colon inside and outside bold", () => {
    expect(headerField("**Status:** Done", "Status",),).toBe("Done",);
    expect(headerField("**Epic**: epic-foo.md", "Epic",),).toBe("epic-foo.md",);
  });
  test("ignores field lines inside fences", () => {
    const text = ["**Status:** open", "", "```", "**Status:** Done", "```",].join("\n",);
    expect(headerField(text, "Status",),).toBe("open",);
  });
  test("h1 strips the TYPE prefix, falls back to the stem", () => {
    expect(h1Title("# TASK: demo ticket", "whatever",),).toBe("demo ticket",);
    expect(h1Title("no heading here", "fallback-stem",),).toBe("fallback-stem",);
  });
});

describe("laneClaims + resolveClaim", () => {
  test("collects tokens in first-seen order, deduped", () => {
    const text = "owns TASK-foo-bar and BUG-baz; TASK-foo-bar again\n```\nTASK-fenced\n```";
    expect(laneClaims(text,),).toEqual(["TASK-FOO-BAR", "BUG-BAZ",],);
  });
  test("resolves exact, unique-prefix, ambiguous, and missing", () => {
    const stems = new Map([
      ["TASK-FOO-BAR", "TASK-foo-bar.md",],
      ["TASK-FOO-BAZ", "TASK-foo-baz.md",],
      ["BUG-SOLO", "BUG-solo.md",],
    ],);
    expect(resolveClaim("task-foo-bar", stems,),).toBe("TASK-foo-bar.md",);
    expect(resolveClaim("BUG-S", stems,),).toBe("BUG-solo.md",);
    expect(resolveClaim("TASK-FOO", stems,),).toBeNull();
    expect(resolveClaim("TASK-NOPE", stems,),).toBeNull();
  });
});

describe("driftOf", () => {
  test("agrees across hyphen/space/case folds", () => {
    expect(driftOf("TASK-demo-ticket", "demo ticket", "Demo Ticket",),).toEqual([],);
  });
  test("tolerates filename truncation (prefix either way is the same ticket)", () => {
    expect(driftOf("TASK-demo-ticket-truncatio", "demo ticket truncation here", "demo ticket truncation here",),)
      .toEqual([],);
  });
  test("reports slug, title, and missing-index drift", () => {
    expect(driftOf("TASK-old-slug", "new title", "new title",).length,).toBe(1,);
    expect(driftOf("TASK-x", "x", "y",).length,).toBe(1,);
    expect(driftOf("TASK-x", "x", null,),).toEqual(["no tickets/index.json entry for this file",],);
  });
});

describe("linkageReport", () => {
  test("binds scoped tickets, warns on unresolvable lanes, errors on drift", () => {
    const index = {
      "TASK-DEMO-TICKET": { title: "demo ticket", git_issue: "abc1234", },
      "TASK-DRIFTED-THING": { title: "drifted thing", git_issue: "def5678", },
    };
    withDirs((tickets, lanes, indexPath,) => {
      writeFileSync(join(tickets, "TASK-demo-ticket.md",), ticketMd(),);
      writeFileSync(join(tickets, "TASK-drifted-thing.md",), ticketMd().replace("demo ticket", "renamed ticket",),);
      writeFileSync(join(tickets, "TASK-other-scope.md",), ticketMd("something else",),);
      writeFileSync(join(lanes, "LANE-demo.md",), "holds TASK-demo-ticket and TASK-ghost-ticket",);
      const report = linkageReport(tickets, lanes, indexPath,);
      expect(report.scoped.map((t,) => t.file),).toEqual(["TASK-demo-ticket.md", "TASK-drifted-thing.md",],);
      expect(report.warnings,).toEqual(["LANE-demo.md: claim TASK-GHOST-TICKET resolves to no ticket file",],);
      expect(report.drifts.map((d,) => d.file),).toEqual(["TASK-drifted-thing.md",],);
    }, index,);
  });
  test("missing lanes dir yields no lanes and no warnings", () => {
    withDirs((tickets, _lanes, indexPath,) => {
      writeFileSync(join(tickets, "TASK-demo-ticket.md",), ticketMd(),);
      const report = linkageReport(tickets, join(tickets, "..", "no-lanes",), indexPath,);
      expect(report.lanes,).toEqual([],);
      expect(report.warnings,).toEqual([],);
    },);
  });
  test("render is deterministic and names the generator", () => {
    withDirs((tickets, lanes, indexPath,) => {
      writeFileSync(join(tickets, "TASK-demo-ticket.md",), ticketMd(),);
      const report = linkageReport(tickets, lanes, indexPath,);
      const epics = new Map([["epic-demo", { title: "Demo", status: "open", },],],);
      const first = render(report, epics, "",);
      expect(render(report, epics, "",),).toBe(first,);
      expect(first,).toContain("bun run plan:entry-map",);
    },);
  });
});

describe("gate registration", () => {
  test("entry-map gate exists and is advisory", () => {
    expect(checks["plan - entry map"],).toBe("bun run plan:entry-map:check",);
    expect(ADVISORY_GATES.has("plan - entry map",),).toBe(true,);
  });
  test("linkage gate exists and blocks on drift", () => {
    expect(checks["plan - linkage"],).toBe("bun run plan:linkage",);
    expect(ADVISORY_GATES.has("plan - linkage",),).toBe(false,);
  });
});
