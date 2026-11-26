// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the argv contract of api-doc-drift.mjs after the Optique migration.
// The gate's real work (regenerate the spec, diff the docs) is expensive and
// repo-wide, so these pin the PARSE half only.
//
// RESOURCE CONTRACT — this suite writes NOTHING and allocates NO fixture:
// - `--nope` fails argument parsing, which happens before any gate logic, so
//   the spec and the generated api.md are never touched.
// - `--help` exits inside the same parse, likewise before any I/O.
// - Deliberately NO zero-args spawn: the gate's first act is to regenerate
//   `docs/reference/openapi.json` and then `docs/reference/api.md`, both shared
//   repo files. Running it from a parallel test would race the `api - doc drift`
//   gate for those paths. The zero-arg shape is covered by gates.mjs invoking
//   the gate bare on every `bun run check`.
// - Verified: docs/reference/openapi.json and docs/reference/api.md are
//   unchanged across a full run of this file.

import { expect, test, } from "bun:test";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "api-doc-drift.mjs",);

/**
 * Spawn the gate and capture both streams.
 *
 * @param args - argv to pass after the script path.
 * @returns exit code plus decoded stdout/stderr.
 */
function runDrift(args,) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], {
    stdout: "pipe",
    stderr: "pipe",
  },);
  return {
    code: proc.exitCode,
    out: new TextDecoder().decode(proc.stdout,),
    err: new TextDecoder().decode(proc.stderr,),
  };
}

test("an undeclared flag is a parse error, not a silent run", () => {
  const { code, err, } = runDrift(["--nope",],);
  expect(code,).toBe(1,);
  expect(err,).toContain("--nope",);
});

test("--help prints the brief and exits 0 without regenerating anything", () => {
  const { code, out, } = runDrift(["--help",],);
  expect(code,).toBe(0,);
  expect(out,).toContain("Fail when docs/reference/api.md",);
  expect(out,).not.toContain("baseline updated",);
});
