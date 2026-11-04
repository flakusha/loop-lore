// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Commit-signature check — every commit a branch adds must be GPG-signed.
 *
 * AGENTS.md makes an unsigned commit a blocker ("reset it and ask the user
 * to re-sign"), but nothing enforced it: `giwt commit-wt` only warns when its
 * signature verification comes back inconclusive, and `giwt finalize`
 * verifies the MERGE commit — never the commits the branch carries. This
 * gate audits the range the branch adds, so an unsigned commit is caught
 * before it can reach `dev`.
 *
 * The verdict is git's own (`%G?`): G good, U good with unknown validity,
 * B bad, R revoked key, X/Y expired, E cannot be checked (no public key),
 * N no signature. Everything git itself would reject fails the gate — except
 * E: a clone without the public key (CI, another machine) cannot check ANY
 * signature, and failing there would redden every run for a reason that is
 * not a defect.
 */

import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

/** Base refs in preference order: the branch's work is what the base lacks. */
const BASE_REFS = ["dev", "main", "master",];

/**
 * The `%G?` codes that pass. Everything else fails, including a code this
 * script does not know: the gate fails closed rather than waving an
 * unverified commit through. E (cannot be checked) passes because the
 * missing public key is the environment's problem, not the commit's.
 */
const PASSING_STATUSES = new Set(["G", "U", "E",],);

/** Wording for a status code, for the report. */
const STATUS_LABEL = {
  N: "no signature",
  B: "bad signature",
  R: "signature from a revoked key",
  X: "expired signature",
  Y: "signature from an expired key",
  E: "signature could not be checked (public key unavailable)",
  U: "good signature (validity unknown)",
  G: "good signature",
};

function git(args,) {
  const proc = Bun.spawnSync(["git", ...args,], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  },);
  return {
    out: proc.stdout.toString(),
    code: proc.exitCode,
    err: proc.stderr.toString(),
  };
}

/**
 * The commits this branch adds: everything on HEAD the base does not have.
 * On the base branch itself the range is empty — the base's own history is
 * not this branch's work, and re-litigating it would flag commits nobody
 * can re-sign.
 *
 * @param base - Base ref name.
 * @returns The revision range, or null when the base or HEAD is absent.
 */
function branchRange(base,) {
  if (git(["rev-parse", "--verify", "-q", base,],).code !== 0) { return null; }
  if (git(["rev-parse", "--verify", "-q", "HEAD",],).code !== 0) { return null; }
  return `${base}..HEAD`;
}

/**
 * sha, subject and signature status for every commit in the range.
 *
 * @param range - Revision range.
 * @returns The commits, oldest first.
 */
function collectCommits(range,) {
  const format = "--format=%x01%H%x02%s%x02%G?%x03";
  const log = git(["log", format, range,],);
  if (log.code !== 0) { throw new Error(`git log failed: ${log.err.trim()}`,); }
  return log.out.split("\x03",).filter((record,) => record.trim().length > 0).map((record,) => {
    const [sha = "", subject = "", status = "",] = record.replace(/^\x01/, "",).split("\x02",);
    return { sha, subject, status, };
  },);
}

/**
 * The commits that fail the signature rule.
 *
 * @param commits - Commits carrying a `%G?` status.
 * @returns The failing ones, in the order they were given.
 */
export function auditCommits(commits,) {
  return commits.filter((commit,) => !PASSING_STATUSES.has(commit.status,));
}

function report(findings,) {
  console.error(
    "commit-signatures: FAILED — the branch adds a commit that is not properly signed:",
  );
  for (const commit of findings) {
    const label = STATUS_LABEL[commit.status] ?? `unrecognised status "${commit.status}"`;
    console.error(`  ${commit.sha.slice(0, 9,)}  ${label}  ${commit.subject}`,);
  }
  console.error("",);
  console.error(
    "AGENTS.md: an unsigned commit is a blocker — reset it and ask the user to re-sign.",
  );
}

function main() {
  const base = BASE_REFS.find((ref,) => git(["rev-parse", "--verify", "-q", ref,],).code === 0);
  if (!base) {
    console.log(
      `commit-signatures: SKIPPED — no base ref (${BASE_REFS.join("/",)}) to measure the branch against`,
    );
    return;
  }
  const range = branchRange(base,);
  if (!range) {
    console.log("commit-signatures: SKIPPED — no HEAD in this repository",);
    return;
  }

  const commits = collectCommits(range,);
  const findings = auditCommits(commits,);
  if (findings.length > 0) {
    report(findings,);
    process.exit(1,);
  }

  if (commits.length === 0) {
    console.log(`commit-signatures: clean (${range} adds nothing to audit)`,);
    return;
  }
  const uncheckable = commits.filter((c,) => c.status === "E").length;
  if (uncheckable === commits.length) {
    console.log(
      `commit-signatures: SKIPPED — ${commits.length} commit(s) cannot be checked locally (no public key)`,
    );
    return;
  }
  const note = uncheckable > 0 ? `, ${uncheckable} not checkable locally` : "";
  console.log(`commit-signatures: clean (${commits.length} commit(s) in ${range}${note})`,);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error("commit-signatures check failed:", error.message,);
    process.exit(2,);
  }
}
