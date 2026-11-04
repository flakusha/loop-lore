// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the verdict boundary of the commit-signature check: a good signature
// passes, an unsigned commit fails, and a signature that cannot be checked
// locally (no public key — CI, another machine) is neither a pass nor a
// failure. Failing there would redden every run for a reason that is not a
// defect; waving an unsigned commit through is the defect this gate exists
// for.

import { expect, test, } from "bun:test";
import { auditCommits, } from "./commit-signatures.mjs";

function commit(status, subject = "chore: thing",) {
  return { sha: "abc123def4567890", subject, status, };
}

test("a good signature passes", () => {
  expect(auditCommits([commit("G",),],),).toEqual([],);
});

test("a good signature of unknown validity passes", () => {
  expect(auditCommits([commit("U",),],),).toEqual([],);
});

test("an unsigned commit fails", () => {
  const findings = auditCommits([commit("N",),],);
  expect(findings,).toHaveLength(1,);
  expect(findings[0].status,).toBe("N",);
});

test("a bad signature fails", () => {
  expect(auditCommits([commit("B",),],),).toHaveLength(1,);
});

test("a revoked or expired signature fails", () => {
  expect(auditCommits([commit("R",), commit("X",), commit("Y",),],),).toHaveLength(3,);
});

test("a signature that cannot be checked locally is not a failure", () => {
  expect(auditCommits([commit("E",),],),).toEqual([],);
});

test("an unrecognised status fails closed", () => {
  expect(auditCommits([commit("",),],),).toHaveLength(1,);
});

test("every offending commit is reported, not just the first", () => {
  const findings = auditCommits([
    commit("G", "chore: signed",),
    commit("N", "fix: unsigned",),
    commit("N", "fix: also unsigned",),
  ],);
  expect(findings.map((c,) => c.subject),).toEqual([
    "fix: unsigned",
    "fix: also unsigned",
  ],);
});
