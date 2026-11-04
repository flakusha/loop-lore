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
 *
 * Every git call runs under a deadline and the log is read incrementally: a
 * wedged git (a partial clone fetching objects over the network, a gpg-agent
 * waiting on a prompt) must fail the gate instead of holding it open, and a
 * long range must cost a bounded amount of memory.
 */

import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

/** Base refs in preference order: the branch's work is what the base lacks. */
const BASE_REFS = ["dev", "main", "master",];

/**
 * Deadline for a single git call, in ms.
 *
 * Overridable so the deadline itself can be exercised in a test instead of
 * being taken on faith.
 */
const GIT_TIMEOUT_MS = Number(process.env.COMMIT_SIGNATURES_TIMEOUT_MS ?? 30_000,);

/**
 * Deadline for the range walk, in ms. It is the larger budget because the
 * walk verifies every signature in the range, not because it may run long.
 */
const GIT_LOG_TIMEOUT_MS = Number(process.env.COMMIT_SIGNATURES_LOG_TIMEOUT_MS ?? 120_000,);

/** Grace between SIGTERM and SIGKILL for a git that ignored SIGTERM. */
const KILL_GRACE_MS = 5_000;

/** Characters of stderr kept from a git call — enough to name the failure. */
const STDERR_CAP = 8_192;

/** Field separator inside one log record (the character git's %x02 emits). */
const FIELD = "\x02";

/** Record separator between log records (the character git's %x03 emits). */
const RECORD = "\x03";

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

/**
 * Arm a deadline on a spawned child.
 *
 * The child gets SIGTERM when the budget runs out and SIGKILL after the
 * grace — a git blocked in a network read or a gpg prompt must not survive
 * the deadline.
 *
 * @param proc - The spawned child.
 * @param timeoutMs - Budget in ms.
 * @returns {state: {timedOut: boolean}, clear: () => void}
 */
function armDeadline(proc, timeoutMs,) {
  const state = { timedOut: false, };
  let hardKill;
  const softKill = setTimeout(() => {
    state.timedOut = true;
    proc.kill("SIGTERM",);
    hardKill = setTimeout(() => proc.kill("SIGKILL",), KILL_GRACE_MS,);
  }, timeoutMs,);
  return {
    state,
    clear: () => {
      clearTimeout(softKill,);
      clearTimeout(hardKill,);
    },
  };
}

/**
 * Drain a stream, keeping at most `cap` characters.
 *
 * The stream is always drained to the end — returning early would leave the
 * child blocked on a full pipe.
 *
 * @param stream - The stream to drain.
 * @param cap - Characters kept.
 * @returns The retained text.
 */
async function drainCapped(stream, cap = STDERR_CAP,) {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) {
    if (text.length < cap) { text += decoder.decode(chunk, { stream: true, },); }
  }
  return text.slice(0, cap,);
}

/**
 * Run a git command under a hard deadline.
 *
 * @param args - git arguments.
 * @param timeoutMs - Budget in ms.
 * @returns {out: string, err: string, code: number, timedOut: boolean}
 */
async function git(args, timeoutMs = GIT_TIMEOUT_MS,) {
  const proc = Bun.spawn(["git", ...args,], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  },);
  const deadline = armDeadline(proc, timeoutMs,);
  try {
    const [out, err,] = await Promise.all([
      new Response(proc.stdout,).text(),
      drainCapped(proc.stderr,),
    ],);
    const code = await proc.exited;
    if (deadline.state.timedOut) {
      // A timeout is a failure, never a silent "no such ref" answer.
      throw new Error(`git ${args.join(" ",)} timed out after ${timeoutMs}ms`,);
    }
    return { out, err, code, timedOut: false, };
  } finally {
    deadline.clear();
  }
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
async function branchRange(base,) {
  if ((await git(["rev-parse", "--verify", "-q", base,],)).code !== 0) { return null; }
  if ((await git(["rev-parse", "--verify", "-q", "HEAD",],)).code !== 0) { return null; }
  return `${base}..HEAD`;
}

/**
 * Walk the range and collect what the gate needs.
 *
 * The log is read incrementally and only the offending commits are kept, so
 * the memory cost of a long range is bounded by the number of failures, not
 * by the size of the range.
 *
 * @param range - Revision range.
 * @returns {total: number, uncheckable: number, findings: Array}
 */
async function collectCommits(range,) {
  const format = "--format=%G?%x02%H%x02%s%x03";
  const proc = Bun.spawn(["git", "log", format, range,], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  },);
  const deadline = armDeadline(proc, GIT_LOG_TIMEOUT_MS,);
  const stderrPromise = drainCapped(proc.stderr,);
  const decoder = new TextDecoder();
  const findings = [];
  let total = 0;
  let uncheckable = 0;
  let buffer = "";
  const consume = (record,) => {
    const commit = parseRecord(record,);
    if (!commit) { return; }
    total += 1;
    if (commit.status === "E") { uncheckable += 1; }
    if (!auditCommit(commit,)) { findings.push(commit,); }
  };
  try {
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true, },);
      let index = buffer.indexOf(RECORD,);
      while (index !== -1) {
        consume(buffer.slice(0, index,),);
        buffer = buffer.slice(index + 1,);
        index = buffer.indexOf(RECORD,);
      }
    }
    const code = await proc.exited;
    const err = await stderrPromise;
    if (deadline.state.timedOut) {
      throw new Error(`git log ${range} timed out after ${GIT_LOG_TIMEOUT_MS}ms`,);
    }
    if (code !== 0) { throw new Error(`git log failed: ${err.trim()}`,); }
    consume(buffer,);
    return { total, uncheckable, findings, };
  } finally {
    deadline.clear();
  }
}

/**
 * Read one log record.
 *
 * The record format is `status`, `sha`, `subject` — status first, because it
 * is a single known character and can never be confused with the rest, and
 * sha second, because it is hex and can never contain the field separator.
 * The subject is the remainder and may contain anything.
 *
 * @param record - The raw record text.
 * @returns The commit, or null for an empty record.
 */
export function parseRecord(record,) {
  const clean = record.replace(/[\r\n]/g, "",).replace(/^\x01/, "",);
  if (clean.trim().length === 0) { return null; }
  const [status = "", sha = "", ...rest] = clean.split(FIELD,);
  if (!sha) {
    // A record that cannot be read is a record that cannot be cleared.
    return { sha: "(unparsed)", subject: clean, status: "", };
  }
  return { sha, subject: rest.join(FIELD,), status, };
}

/**
 * Does this commit's signature status pass the gate?
 *
 * @param commit - A commit with a `%G?` status.
 * @returns True when the status is acceptable.
 */
export function auditCommit(commit,) {
  return PASSING_STATUSES.has(commit.status,);
}

/**
 * The commits that fail the signature rule.
 *
 * @param commits - Commits carrying a `%G?` status.
 * @returns The failing ones, in the order they were given.
 */
export function auditCommits(commits,) {
  return commits.filter((commit,) => !auditCommit(commit,));
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

async function main() {
  let base;
  for (const ref of BASE_REFS) {
    if ((await git(["rev-parse", "--verify", "-q", ref,],)).code === 0) {
      base = ref;
      break;
    }
  }
  if (!base) {
    console.log(
      `commit-signatures: SKIPPED — no base ref (${BASE_REFS.join("/",)}) to measure the branch against`,
    );
    return;
  }
  const range = await branchRange(base,);
  if (!range) {
    console.log("commit-signatures: SKIPPED — no HEAD in this repository",);
    return;
  }

  const { total, uncheckable, findings, } = await collectCommits(range,);
  if (findings.length > 0) {
    report(findings,);
    process.exit(1,);
  }

  if (total === 0) {
    console.log(`commit-signatures: clean (${range} adds nothing to audit)`,);
    return;
  }
  if (uncheckable === total) {
    console.log(
      `commit-signatures: SKIPPED — ${total} commit(s) cannot be checked locally (no public key)`,
    );
    return;
  }
  const note = uncheckable > 0 ? `, ${uncheckable} not checkable locally` : "";
  console.log(`commit-signatures: clean (${total} commit(s) in ${range}${note})`,);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error("commit-signatures check failed:", error.message,);
    process.exit(2,);
  }
}
