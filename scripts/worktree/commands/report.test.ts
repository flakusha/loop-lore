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
  const corruptReportDir = join(treeDir, "corrupt", ".tmp",);
  const noGatesReportDir = join(treeDir, "no-gates", ".tmp",);
  mkdirSync(validReportDir, { recursive: true, },);
  mkdirSync(corruptReportDir, { recursive: true, },);
  mkdirSync(noGatesReportDir, { recursive: true, },);
  // Worktree with no report file at all.
  mkdirSync(join(treeDir, "missing",), { recursive: true, },);
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
  writeFileSync(join(corruptReportDir, "check-report.json",), "{not valid json",);
  writeFileSync(join(noGatesReportDir, "check-report.json",), '{ "branch": "x" }',);
  return { repoRoot: root, treeDir, };
}

async function captureOutput(config: WorktreeConfig,): Promise<string> {
  const logSpy = spyOn(console, "log",);
  try {
    await report([], config,);
  } finally {
    const output = logSpy.mock.calls.map(args => args.join(" ",)).join("\n",);
    logSpy.mockRestore();
    return output;
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0,)) {
    rmSync(root, { recursive: true, force: true, },);
  }
},);

describe("worktree report", () => {
  test("lists a 'no report' row when a worktree has no report file", async () => {
    const config = makeReportConfig();

    const output = await captureOutput(config,);

    expect(output,).toContain("missing",);
    expect(output,).toContain("no report",);
    expect(output,).toContain("valid-branch",);
  });

  test("lists a 'malformed report' row for unparseable JSON without aborting", async () => {
    const config = makeReportConfig();

    const output = await captureOutput(config,);

    expect(output,).toContain("corrupt",);
    expect(output,).toContain("malformed report",);
    expect(output,).toContain("valid-branch",);
  });

  test("continues after a worktree report is missing its gates", async () => {
    const config = makeReportConfig();

    const output = await captureOutput(config,);

    expect(output,).toContain("malformed report",);
    expect(output,).toContain("valid-branch",);
  });

  test("lists a 'malformed report' row for a malformed main report", async () => {
    const config = makeReportConfig();
    const mainReportDir = join(config.repoRoot, ".tmp",);
    mkdirSync(mainReportDir, { recursive: true, },);
    writeFileSync(join(mainReportDir, "check-report.json",), "{not valid json",);

    const output = await captureOutput(config,);

    expect(output,).toContain("(main)",);
    expect(output,).toContain("malformed report",);
    expect(output,).toContain("valid-branch",);
  });
});
