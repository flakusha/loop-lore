// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The scoped coverage gate runs two independent test passes side by side. That
 * is only worth it if the bash construct keeps the exit-code contract, so
 * every case here drives the REAL shell — the runner executes gate commands
 * through `bash -c`, so the shell is what decides.
 */

import { expect, test, } from "bun:test";
import { mkdtempSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { overlapCommands, } from "./scoped-overlap.mjs";

function runBash(command,) {
  const proc = Bun.spawnSync(["bash", "-c", command,], { stdout: "pipe", stderr: "pipe", },);
  return {
    code: proc.exitCode,
    out: new TextDecoder().decode(proc.stdout,),
  };
}

test("both halves succeed and the trailing command still runs", () => {
  const result = runBash(`${overlapCommands("true", "true",)} && echo FLOOR`,);
  expect(result.code,).toBe(0,);
  expect(result.out,).toContain("FLOOR",);
});

test("the first failure's own exit code survives", () => {
  const result = runBash(`${overlapCommands("exit 3", "true",)} && echo FLOOR`,);
  expect(result.code,).toBe(3,);
  expect(result.out,).not.toContain("FLOOR",);
});

test("the second failure's own exit code survives", () => {
  const result = runBash(`${overlapCommands("true", "exit 5",)} && echo FLOOR`,);
  expect(result.code,).toBe(5,);
  expect(result.out,).not.toContain("FLOOR",);
});

test("the halves run concurrently, not one after the other", () => {
  // The first half blocks until the second one creates the marker. Run one
  // after the other, the first would block until its own timeout kills it;
  // overlapped, the second half unblocks it.
  const dir = mkdtempSync(join(tmpdir(), "scoped-overlap-",),);
  const marker = join(dir, "second-ran",);
  const first = `timeout 3 bash -c "until [ -f ${marker} ]; do sleep 0.05; done"`;
  const second = `sleep 0.2; touch ${marker}`;
  const result = runBash(`${overlapCommands(first, second,)} && echo FLOOR`,);
  expect(result.code,).toBe(0,);
  expect(result.out,).toContain("FLOOR",);
});
