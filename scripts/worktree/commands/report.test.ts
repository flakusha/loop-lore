// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, spyOn, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "fs";
import { join, } from "path";
import type { WorktreeConfig, } from "../utils/config";
import { report, } from "./report";

const tempRoots: string[] = [];

function makeReportConfig(): WorktreeConfig {
  const root = mkdtempSync(join("/tmp", "worktree-report-test-",),);
  tempRoots.push(root,);
  const treeDir = join(root, "tree",);
  const validReportDir = join(treeDir, "valid", ".tmp",);
  const malformedReportDir = join(treeDir, "malformed", ".tmp",);
  mkdirSync(validReportDir, { recursive: true, },);
  mkdirSync(malformedReportDir, { recursive: true, },);
  writeFileSync(
    join(validReportDir, "check-report.json",),
    JSON.stringify({
      branch: "valid-branch",
      gitHead: "abc1234",
      runId: "run-1",
      mode: "plain",
      gates: { typecheck: { status: "passed", }, },
      passed: true,
      timestamp: "2026-09-09T00:00:00.000Z",
    },),
  );
  writeFileSync(join(malformedReportDir, "check-report.json",), '{ "branch": "x" }',);
  return { repoRoot: root, treeDir, };
}

afterEach(() => {
  for (const root of tempRoots.splice(0,)) {
    rmSync(root, { recursive: true, force: true, },);
  }
},);

describe("worktree report", () => {
  test("continues after a worktree report is missing its gates", async () => {
    const config = makeReportConfig();
    const logSpy = spyOn(console, "log",);

    await report([], config,);

    const output = logSpy.mock.calls.map(args => args.join(" ",)).join("\n",);
    logSpy.mockRestore();
    expect(output,).toContain("malformed report",);
    expect(output,).toContain("valid-branch",);
  });
});
