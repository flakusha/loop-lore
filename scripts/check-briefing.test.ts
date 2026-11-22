// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import {
  capRows,
  gateDecision,
  isScannableTicket,
  listTickets,
  MAX_ROWS,
  resolveGate,
  resolveTicketPath,
  scoreTicketFile,
  selectDiffTickets,
  summaryLine,
  type TicketScore,
} from "./check-briefing.js";
import { ADVISORY_GATES, checks, } from "./check/parallel/gate-table.mjs";

/**
 * CLI + gate contract for scripts/check-briefing.ts.
 *
 * RESOURCE CONTRACT: each case that needs files owns a fresh mkdtemp dir and
 * removes it in `finally`. No fixed paths, no shared fixtures, no env mutation
 * in-process (BRIEFING_GATE is passed only to spawned children).
 */

const SCRIPT = `${import.meta.dir}/check-briefing.ts`;

const FULL = [
  "# TASK: demo",
  "",
  "## Summary",
  "Build the thing.",
  "",
  "## Context",
  "epic-demo src/plan/demo.ts",
  "",
  "## Strategic Advice",
  "Use the existing helper.",
  "",
  "## Risks",
  "Watch the edge case.",
  "",
  "## Acceptance Criteria",
  "- [ ] Passes in <=500ms",
].join("\n",);

function withTickets(files: Record<string, string>, fn: (dir: string,) => void,): void {
  const dir = mkdtempSync(join(tmpdir(), "briefing-cli-",),);
  try {
    for (const [name, content,] of Object.entries(files,)) {
      writeFileSync(join(dir, name,), content,);
    }
    fn(dir,);
  } finally {
    rmSync(dir, { recursive: true, force: true, },);
  }
}

interface RunOpts {
  cwd?: string;
  env?: Record<string, string>;
}

function run(args: string[], gate?: string, opts: RunOpts = {},) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], {
    cwd: opts.cwd ?? import.meta.dir,
    env: {
      ...process.env,
      ...(gate === undefined ? {} : { BRIEFING_GATE: gate, }),
      ...opts.env,
    },
  },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

function git(args: string[], cwd: string,): void {
  const proc = Bun.spawnSync(["git", ...args,], { cwd, },);
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ",)} failed: ${proc.stderr.toString().trim()}`,);
  }
}

function score(file: string, scoreValue: number, verdict: TicketScore["verdict"],): TicketScore {
  return { file, score: scoreValue, verdict, suggestions: ["fix it",], };
}

describe("check-briefing CLI", () => {
  test("selects only scoreable ticket markdown", () => {
    expect(isScannableTicket("TASK-demo.md",),).toBe(true,);
    expect(isScannableTicket("BUG-demo.md",),).toBe(false,);
    expect(isScannableTicket("TASK-help.md",),).toBe(false,);
    expect(isScannableTicket("index.json",),).toBe(false,);
    expect(isScannableTicket("notes.txt",),).toBe(false,);
  });

  test("gate mode defaults to warn and accepts all three values", () => {
    expect(resolveGate(undefined,),).toBe("warn",);
    expect(resolveGate("",),).toBe("warn",);
    expect(resolveGate("off",),).toBe("off",);
    expect(resolveGate("fail",),).toBe("fail",);
  });

  test("unknown gate mode is rejected", () => {
    expect(() => resolveGate("maybe",)).toThrow("BRIEFING_GATE",);
  });

  test("ticket slug resolves into the tickets directory", () => {
    expect(resolveTicketPath("TASK-demo",),).toContain(".plan/tickets/TASK-demo.md",);
    expect(resolveTicketPath("/tmp/TASK-demo.md",),).toBe("/tmp/TASK-demo.md",);
  });

  test("full, empty and BUG fixtures score as expected", () => {
    withTickets({
      "TASK-full.md": FULL,
      "TASK-empty.md": "",
      "BUG-symptom.md": "## Summary\nBroken.\n## Risks\nNone.\n## Acceptance Criteria\n- [ ] fixed",
    }, (dir,) => {
      const scores = listTickets(dir,).map(scoreTicketFile,);
      expect(scores.find((entry,) => entry.file.includes("TASK-full",))?.verdict,).toBe("actionable",);
      expect(scores.find((entry,) => entry.file.includes("TASK-empty",))?.score,).toBe(0,);
      const bug = scoreTicketFile(join(dir, "BUG-symptom.md",),);
      expect(bug.score,).toBe(4,);
      expect(bug.verdict,).toBe("actionable",);
      expect(scores.some((entry,) => entry.file.includes("BUG-symptom",)),).toBe(false,);
    },);
  });

  test("off emits no findings and always exits 0", () => {
    const decision = gateDecision([score("t.md", 0, "reject",),], "off",);
    expect(decision.exitCode,).toBe(0,);
    expect(decision.lines,).toHaveLength(0,);
  });

  test("warn reports marginal and reject without failing", () => {
    const decision = gateDecision([score("a.md", 3, "marginal",), score("b.md", 1, "reject",),], "warn",);
    expect(decision.exitCode,).toBe(0,);
    expect(decision.lines.every((line,) => line.startsWith("warn: ",)),).toBe(true,);
  });

  test("fail errors on reject but only warns on marginal", () => {
    const decision = gateDecision([score("a.md", 3, "marginal",), score("b.md", 1, "reject",),], "fail",);
    expect(decision.exitCode,).toBe(1,);
    expect(decision.lines[0],).toContain("warn:",);
    expect(decision.lines[1],).toContain("error:",);
  });

  test("--help prints the brief and exits 0", () => {
    const result = run(["--help",],);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("BriefingScript",);
  });

  test("single-ticket mode matches the batch scorer", () => {
    withTickets({ "TASK-single.md": FULL, }, (dir,) => {
      const path = join(dir, "TASK-single.md",);
      const batchScore = listTickets(dir,).map(scoreTicketFile,)[0]?.score;
      const result = run([path,], "off",);
      expect(result.exitCode,).toBe(0,);
      expect(result.stdout,).toMatch(/5\/5\s+actionable/,);
      expect(batchScore,).toBe(5,);
    },);
  });

  test("BRIEFING_GATE=fail exits 1 on a rejected ticket", () => {
    withTickets({ "TASK-reject.md": "", }, (dir,) => {
      const result = run([join(dir, "TASK-reject.md",),], "fail",);
      expect(result.exitCode,).toBe(1,);
      expect(result.stderr,).toContain("error:",);
    },);
  });

  test("briefing gate is registered as advisory", () => {
    const name = "briefing - pre-agent ticket quality";
    expect(checks[name],).toBe("bun run plan:validate:briefing",);
    expect(ADVISORY_GATES.has(name,),).toBe(true,);
  });

  test("capRows and summaryLine bound the report deterministically", () => {
    const rows = Array.from({ length: MAX_ROWS + 5, }, (_, i,) => score(`TASK-${i}.md`, 5, "actionable",),);
    expect(capRows(rows,),).toHaveLength(MAX_ROWS,);
    expect(capRows(rows, 3,),).toHaveLength(3,);
    expect(summaryLine(rows.length, rows.length,),).toBe("25 actionable / 25 scanned",);
  });

  test("CLI caps table rows and prints the summary for >20 flagged tickets", () => {
    const files = Object.fromEntries(
      Array.from({ length: MAX_ROWS + 5, }, (_, i,) => [`TASK-${String(i,).padStart(2, "0",)}.md`, "",],),
    );
    withTickets(files, (dir,) => {
      const result = run([], "off", { env: { BRIEFING_TICKETS_DIR: dir, }, },);
      expect(result.exitCode,).toBe(0,);
      const lines = result.stdout.trim().split("\n",);
      expect(lines,).toHaveLength(MAX_ROWS + 1,);
      expect(lines[MAX_ROWS],).toBe("0 actionable / 25 scanned",);
    },);
  });

  test("selectDiffTickets keeps only changed scannable tickets", () => {
    const dir = join(tmpdir(), "repo", ".plan", "tickets",);
    expect(selectDiffTickets([
      ".plan/tickets/TASK-a.md",
      "src/foo.ts",
      ".plan/tickets/BUG-x.md",
      ".plan/tickets/TASK-help.md",
      ".plan/tickets/nested/TASK-c.md",
      "/other/.plan/tickets/TASK-b.md",
      ".plan/tickets/TASK-a.md",
    ], dir,),).toEqual([join(dir, "TASK-a.md",), join(dir, "TASK-b.md",),],);
  });

  test("--diff-base restricts the batch scan to changed tickets", () => {
    const dir = mkdtempSync(join(tmpdir(), "briefing-diff-",),);
    try {
      const tickets = join(dir, ".plan", "tickets",);
      mkdirSync(tickets, { recursive: true, },);
      writeFileSync(join(tickets, "TASK-a.md",), "",);
      writeFileSync(join(tickets, "TASK-b.md",), "",);
      git(["init", "-q",], dir,);
      git(["config", "user.email", "test@example.com",], dir,);
      git(["config", "user.name", "test",], dir,);
      git(["add", "-f", ".",], dir,);
      git(["-c", "commit.gpgsign=false", "commit", "-qm", "base",], dir,);
      writeFileSync(join(tickets, "TASK-b.md",), FULL,);

      const flagged = run(["--diff-base", "HEAD",], "off", {
        cwd: dir,
        env: { BRIEFING_TICKETS_DIR: tickets, },
      },);
      expect(flagged.exitCode,).toBe(0,);
      expect(flagged.stdout,).toContain("TASK-b.md",);
      expect(flagged.stdout,).not.toContain("TASK-a.md",);
      expect(flagged.stdout,).toContain("1 actionable / 1 scanned",);

      const env = run([], "off", {
        cwd: dir,
        env: { BRIEFING_TICKETS_DIR: tickets, BRIEFING_DIFF_BASE: "HEAD", },
      },);
      expect(env.stdout,).toContain("1 actionable / 1 scanned",);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });
});
