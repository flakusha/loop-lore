// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import {
  gateDecision,
  isScannableTicket,
  listTickets,
  resolveGate,
  resolveTicketPath,
  scoreTicketFile,
  type TicketScore,
} from "./check-briefing.js";

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

function run(args: string[], gate?: string,) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], {
    cwd: import.meta.dir,
    env: { ...process.env, ...(gate === undefined ? {} : { BRIEFING_GATE: gate, }), },
  },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
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
});
