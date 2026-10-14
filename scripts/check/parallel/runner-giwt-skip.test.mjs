// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * B1: the FAIL→SKIP reclassification for the giwt "git issue CLI
 * unavailable" marker must key on the gate NOT STARTING (the shell could not
 * exec the tool: exit 126/127), never on the marker appearing as a substring
 * of the output of a gate that RAN and failed (exit 1/3/...).
 *
 * Reproduction of the reported bug: runCheck on a failing gate whose output
 * contained the marker returned { passed: false, skipped: true } — a genuinely
 * failing gate exited the run green.
 */

import { expect, test, } from "bun:test";
import { runCheck, } from "./runner.mjs";

test("a gate that RAN and failed (exit 1) with the marker in output stays FAIL", async () => {
  const r = await runCheck(
    "plan - validate",
    "echo 'git issue CLI unavailable: git binary missing' >&2; exit 1",
  );
  expect(r.passed,).toBe(false,);
  expect(r.skipped, "exit 1 is a real failure, not an unevaluated gate",).toBe(false,);
  expect(r.exitCode,).toBe(1,);
});

test("a gate whose launcher could not exec the tool (126) with the marker is SKIP", async () => {
  const r = await runCheck(
    "plan - validate",
    "echo 'git issue CLI unavailable' >&2; exit 126",
  );
  expect(r.skipped,).toBe(true,);
  expect(r.passed,).toBe(false,);
  expect(r.exitCode,).toBe(126,);
});

test("could not exec (127) with the marker is SKIP", async () => {
  const r = await runCheck(
    "plan - validate",
    "echo 'git issue CLI unavailable' >&2; exit 127",
  );
  expect(r.skipped,).toBe(true,);
  expect(r.passed,).toBe(false,);
});

test("could-not-start WITHOUT the marker is FAIL, not SKIP", async () => {
  const r = await runCheck(
    "plan - validate",
    "echo 'some other launcher failure' >&2; exit 126",
  );
  expect(r.skipped,).toBe(false,);
  expect(r.passed,).toBe(false,);
  expect(r.exitCode,).toBe(126,);
});

test("the marker embedded in a larger diagnostic on a failing gate is FAIL", async () => {
  const r = await runCheck(
    "typecheck - backend",
    "echo 'Error while reconciling: git issue CLI unavailable, tried 3 times' >&2; exit 3",
  );
  expect(r.skipped,).toBe(false,);
  expect(r.passed,).toBe(false,);
  expect(r.exitCode,).toBe(3,);
});

test("a failing gate whose marker arrives on stdout (not stderr) still FAILs on exit 1", async () => {
  const r = await runCheck(
    "plan - validate",
    "echo 'git issue CLI unavailable'; exit 1",
  );
  expect(r.skipped,).toBe(false,);
  expect(r.passed,).toBe(false,);
});
