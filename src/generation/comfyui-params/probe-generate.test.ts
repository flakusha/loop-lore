// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Probe test generator: emission content plus emitted-file self-run.
 *
 * The content test pins the emission contract (workflow id, output kind,
 * and engine import present in the source). The self-run writes the
 * emission to the runner's per-test tmp dir and executes it in a child
 * `bun test` with a timeout guard, proving the emitted file passes —
 * `Bun.spawnSync` timeout is the anti-wedge guard, not decoration.
 *
 * Resource contract: the only shared state is the committed fixture files,
 * read-only. The emission lands in a unique mkdtemp dir per test, removed
 * in `finally`; the child process inherits no handles back.
 */
import { describe, expect, it, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { convertWorkflow, } from "../comfyui-converter/index";
import type { ObjectInfoSnapshot, UiWorkflow, } from "../comfyui-converter/types";
import { deriveParameters, } from "./derive";
import { generateProbeTest, } from "./probe-generate";

const FIXTURES = "src/generation/comfyui-converter/fixtures";
const ROOT = join(import.meta.dir, "..", "..", "..",);
const FIXTURE_FILE = join(ROOT, FIXTURES, "v-0010-dasiwa-minimax.json",);
const SNAPSHOT_FILE = join(ROOT, FIXTURES, "object-info.json",);

function v0010Source(): string {
  const raw = JSON.parse(readFileSync(FIXTURE_FILE, "utf8",),) as UiWorkflow;
  const workflow: UiWorkflow = {
    ...raw,
    nodes: (raw.nodes ?? []).map((node,) => node.id === 1512 ? { ...node, title: "[p] Settings", } : node),
  };

  const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8",),) as ObjectInfoSnapshot;
  const graph = convertWorkflow(workflow, snapshot,).graph;
  const derived = deriveParameters({ workflow, converted: graph, workflowId: "v-0010", snapshot, },);
  return generateProbeTest({
    workflowId: "v-0010",
    fixtureFile: FIXTURE_FILE,
    markedNodeId: 1512,
    snapshotFile: SNAPSHOT_FILE,
    expectedOutputKind: "video",
    derived,
    moduleDir: import.meta.dir,
  },);
}

describe("generateProbeTest", () => {
  it("emits the workflow id, output kind, and engine import", () => {
    const source = v0010Source();
    expect(source,).toContain("v-0010",);
    expect(source,).toContain('"video"',);
    expect(source,).toContain("/probe",);
    expect(source,).toContain("runAcceptanceProbe",);
    expect(source,).toContain("in-process",);
  });

  it("emits a file that passes under bun test", () => {
    // The emission carries absolute engine/fixture paths, so it runs from
    // any directory: unique mkdtemp dir per test, removed in `finally`.
    // The path arg is absolute (proven path form — a bare relative path is
    // treated as a name filter by `bun test`).
    const dir = mkdtempSync(join(tmpdir(), "loop-lore-probe-gen-",),);
    try {
      const file = join(dir, "v-0010.probe.test.ts",);
      writeFileSync(file, v0010Source(),);
      const proc = Bun.spawnSync({
        cmd: [process.execPath, "test", file,],
        cwd: dir,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      },);

      // Bun prints the version banner to stdout and the run summary to
      // stderr — the pass count lives in stderr.
      const summary = proc.stderr.toString();
      expect(summary,).toContain("1 pass",);
      expect(proc.exitCode,).toBe(0,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });
});
