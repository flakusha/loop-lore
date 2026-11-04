// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the verdict boundary of the commit-signature check: a good signature
// passes, an unsigned commit fails, and a signature that cannot be checked
// locally (no public key — CI, another machine) is neither a pass nor a
// failure. Failing there would redden every run for a reason that is not a
// defect; waving an unsigned commit through is the defect this gate exists
// for. The record parser and the call deadline are pinned here too: a
// mis-read record hides the sha the user has to re-sign, and a wedged git
// must fail the gate instead of holding it open.

import { expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { auditCommits, parseRecord, } from "./commit-signatures.mjs";

/** The gate under test. */
const SCRIPT = join(import.meta.dir, "commit-signatures.mjs",);

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

// The record parser: git writes a newline after every record, so a parser
// that does not strip it loses the first field of every record but the
// first — the sha the user has to re-sign.

test("a record keeps its sha and status after git's trailing newline", () => {
  const parsed = parseRecord("\nG\x02abc123def4567890\x02feat: thing",);
  expect(parsed.sha,).toBe("abc123def4567890",);
  expect(parsed.status,).toBe("G",);
  expect(parsed.subject,).toBe("feat: thing",);
});

test("a subject containing the field separator survives", () => {
  const parsed = parseRecord("N\x02abc123\x02fix: a \x02 b",);
  expect(parsed.status,).toBe("N",);
  expect(parsed.sha,).toBe("abc123",);
  expect(parsed.subject,).toBe("fix: a \x02 b",);
});

test("an unreadable record fails closed instead of being dropped", () => {
  const parsed = parseRecord("N",);
  expect(auditCommits([parsed,],),).toHaveLength(1,);
});

test("an empty record is no record at all", () => {
  expect(parseRecord("\n",),).toBeNull();
});

// The deadline: a git that never answers (a partial clone fetching objects,
// a gpg-agent waiting on a prompt) must fail the gate, not hold it open and
// not be read as "no such ref".

test("a wedged git fails the gate on the deadline instead of hanging", { timeout: 60_000, }, () => {
  const dir = mkdtempSync(join(tmpdir(), "commit-sig-timeout-",),);
  const shim = join(dir, "git",);
  writeFileSync(shim, "#!/usr/bin/env bash\nexec sleep 30\n",);
  chmodSync(shim, 0o755,);
  try {
    const result = spawnSync("bun", [SCRIPT,], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ""}`,
        COMMIT_SIGNATURES_TIMEOUT_MS: "1000",
      },
      encoding: "utf8",
      timeout: 30_000,
    },);
    expect(result.status,).toBe(2,);
    expect(result.stderr,).toContain("timed out",);
  } finally {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);
