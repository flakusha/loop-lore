// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Drives the real kill path: a fixture that sleeps past its budget must come
// back as a FAILED gate with timedOut, not hang the test runner
// (BUG-parallel-check-runner-has-no-per-gate-timeout).

import { expect, test, } from "bun:test";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import {
  DEFAULT_GATE_TIMEOUT_MS,
  runGateWithTimeout,
} from "./gate-timeout.mjs";

const run = options => runGateWithTimeout({ name: "fixture", cwd: import.meta.dir, ...options, },);

test("a gate that exits 0 within budget passes and reports no timeout", async () => {
  const gate = await run({ command: "echo ok", timeoutMs: 10_000, },);

  expect(gate.ok,).toBe(true,);
  expect(gate.timedOut,).toBe(false,);
  expect(gate.exitCode,).toBe(0,);
  expect(gate.stdout,).toContain("ok",);
  expect(gate.name,).toBe("fixture",);
});

test("a gate that exits non-zero fails without claiming a timeout", async () => {
  const gate = await run({ command: "echo boom >&2; exit 3", timeoutMs: 10_000, },);

  expect(gate.ok,).toBe(false,);
  // A gate that ran and said no is a different failure from one that hung.
  expect(gate.timedOut,).toBe(false,);
  expect(gate.exitCode,).toBe(3,);
  expect(gate.stderr,).toContain("boom",);
});

test("a gate sleeping past its budget is killed and reported as timed out", async () => {
  const startedAt = performance.now(),
    gate = await run({ command: "sleep 30", timeoutMs: 300, },);

  expect(gate.timedOut,).toBe(true,);
  expect(gate.ok,).toBe(false,);
  // The whole point: bounded, not the full 30s the child asked for.
  expect(performance.now() - startedAt,).toBeLessThan(15_000,);
});

test("the kill reaches descendants, not just the direct child", async () => {
  // The shell outlives its budget while a grandchild keeps running. Signalling
  // only the direct child would leave that grandchild burning CPU and holding
  // the pipe open -- exactly the host pressure that makes the next gate the
  // one that gets OOM-killed. The marker is its tell: written only if it lived.
  // Lives in the OS temp dir, never the repo: a survivor that survives this
  // test would otherwise leave scratch in scripts/.
  const marker = join(tmpdir(), `gate-timeout-grandchild-${process.pid}.marker`,),
    command = `( sleep 1.5; touch ${JSON.stringify(marker,)} ) & sleep 30`,
    gate = await run({ command, timeoutMs: 200, },);

  expect(gate.timedOut,).toBe(true,);
  // Wait past the point where a survivor would have written the marker.
  await new Promise(r => setTimeout(r, 2_500,));
  const survived = await Bun.file(marker,).exists();
  await Bun.file(marker,).delete().catch(() => {},);
  expect(survived, "grandchild outlived the kill - the process group was not signalled",).toBe(false,);
});

test("output is still captured when a gate times out", async () => {
  const gate = await run({ command: "echo before-sleep; sleep 30", timeoutMs: 300, },);

  expect(gate.timedOut,).toBe(true,);
  // What the gate managed to say before the deadline is still the only clue
  // about why it was slow; dropping it would make the timeout undiagnosable.
  expect(gate.stdout,).toContain("before-sleep",);
});

test("the default budget is a wall-clock value, not a sentinel", () => {
  expect(DEFAULT_GATE_TIMEOUT_MS,).toBeGreaterThan(0,);
  expect(Number.isFinite(DEFAULT_GATE_TIMEOUT_MS,),).toBe(true,);
});
