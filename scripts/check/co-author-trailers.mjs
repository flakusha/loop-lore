#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 260
// Single-purpose pre-commit hook: one entry point, one audit, no importers.
// Splitting it would only add an import boundary no caller crosses.

/**
 * Co-Authored-By trailer check — a trailer is only attribution if the identity
 * it names participates in the commits. 14 trailers on dev named agents
 * (`omp-agent`, `archivist-agent`, ...) absent from every author/committer
 * population; they asserted code they did not write.
 *
 * Conservative, flagging only a total miss: the email is the key and a match is
 * proof, the name never is. Passes when the trailer matches its own commit, any
 * author/committer in the range, the canonical `user.email`, or an
 * `ALLOWED_TRAILERS` consent from .credentials.env (giwt's rule).
 *
 * Usage: `bun run scripts/check/co-author-trailers.mjs [--range [<range>]]`,
 * commit message on stdin. Mode is explicit — `--range` audits commit messages
 * (no value: this branch's unmerged range, what pre-commit wants); bare stdin
 * audits that one message (what prepare-commit-msg wants). Exit codes: 0
 * clean, 1 offending trailers found, 2 tooling failure.
 */
import { existsSync, readFileSync, } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

/** Only this trailer type is in scope. */
const CO_AUTHOR_RE = /^[ \t]*co-authored-by:[ \t]*(.+?)[ \t]*$/i;

// git reads go via the pinned giwt passthrough first (a harness rerouting raw
// git lands there too), plain git when giwt is absent. giwt prints a run-record
// banner on stdout, so banner lines are dropped before parsing.
const GIWT = path.join(PROJECT_ROOT, "node_modules", "giwt", "src", "cli.ts",);

function stripBanner(text,) {
  return text.split("\n",).filter((line,) => !line.startsWith("Run record:",)).join("\n",);
}

// `okExits` are outcomes that are values, not failures: `config --get` exits 1
// for an unset key. Any other nonzero exit still throws — a real git failure
// must not read as clean.
function readGit(args, okExits = [0,],) {
  const hasGiwt = existsSync(GIWT,);
  if (hasGiwt) {
    const proc = Bun.spawnSync(["bun", GIWT, "git", ...args,], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    if (proc.exitCode === 0) {
      return stripBanner(new TextDecoder().decode(proc.stdout,),);
    }
    // giwt unavailable or refused — fall through to plain git.
  }
  const proc = Bun.spawnSync(["git", ...args,], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  },);
  if (!okExits.includes(proc.exitCode,)) {
    throw new Error(
      `git ${args[0]} failed (${hasGiwt ? "giwt then git" : "git"}): ${new TextDecoder().decode(proc.stderr,)}`,
    );
  }
  return new TextDecoder().decode(proc.stdout,);
}

/** Commit messages + resolved identity of every commit in the range. */
function collectCommits(range,) {
  if (range === "") { return []; } // repo with no commits: nothing to audit
  const format = "--format=%x01%H%x02%an <%ae>%x02%cn <%ce>%x02%B%x03";
  const viaGiwt = parseRecords(readGit(["log", format, range,],),);
  const expected = readGit(["rev-list", "--count", range,],).trim();
  // rtk, in the giwt passthrough, compacts output: it caps at 50 lines and
  // elides fields. A compacted record loses its committer, auditing against a
  // one-identity population and calling a fabricated trailer clean. Any sign of
  // compaction re-reads raw.
  const compacted = expected !== "" && (
    viaGiwt.length !== Number(expected,) || viaGiwt.some((c,) => !c.wellFormed)
  );
  if (!compacted) { return viaGiwt; }
  const proc = Bun.spawnSync(["git", "log", format, range,], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  },);
  if (proc.exitCode !== 0) {
    throw new Error(`git log failed: ${new TextDecoder().decode(proc.stderr,)}`,);
  }
  return parseRecords(new TextDecoder().decode(proc.stdout,),);
}

function parseRecords(raw,) {
  // Each record is prefixed with SOH (\x01) by `git log`; strip it by comparing
  // the leading code point instead of matching it inside a regex pattern, which
  // keeps the control character out of a literal.
  const stripRecordPrefix = (r,) => r.startsWith("\x01",) ? r.slice(1,) : r;

  return raw.split("\x03",).map(stripRecordPrefix,).filter((r,) => r.trim())
    .map((record,) => {
      const [sha, ident = "", committer = "", message = "",] = record.split("\x02",);
      // "..." is rtk's truncation marker; a clipped email would be an identity
      // that matches nothing, i.e. a false finding.
      const wellFormed = /^[0-9a-f]{40}$/.test(sha,) && !ident.includes("...",) &&
        !committer.includes("...",) && /<[^>]+>/.test(ident,) && /<[^>]+>/.test(committer,);
      return { sha, ident, committer, message, wellFormed, };
    },);
}

function emailOf(ident,) {
  return (/<([^>]*)>/.exec(ident,)?.[1] ?? "").trim().toLowerCase();
}

// ALLOWED_TRAILERS value -> consent fragments, in giwt's dialect
// (src/utils/coauthors.ts): giwt documents the quoted form, so a value keeping
// its quotes yields fragments matching no trailer.
export function parseAllowedTrailers(value,) {
  return value.split(",",).map((f,) => f.trim().replace(/^"|"$/g, "",).toLowerCase())
    .filter((f,) => f !== "");
}

function readAllowedTrailers() {
  for (
    let dir = PROJECT_ROOT;
    dir !== path.dirname(dir,);
    dir = path.dirname(dir,)
  ) {
    const file = path.join(dir, ".credentials.env",);
    if (!existsSync(file,)) { continue; }
    const line = /^ALLOWED_TRAILERS=(.*)$/m.exec(readFileSync(file, "utf8",),)?.[1] ?? "";
    return parseAllowedTrailers(line,);
  }
  return [];
}

// Who a trailer may claim: every author/committer in the range, plus the
// canonical config identity, plus ALLOWED_TRAILERS consents.
function buildPopulation(commits,) {
  const emails = new Map();
  for (const commit of commits) {
    for (const ident of [commit.ident, commit.committer,]) {
      const email = emailOf(ident,);
      if (email) { emails.set(email, ident,); }
    }
  }
  // `git config --get` exits 1 when the key is unset — a clone or CI checkout
  // with no local identity has no canonical email: empty, not a failure.
  const canonical = readGit(["config", "--get", "user.email",], [0, 1,],).trim().toLowerCase();
  if (canonical) { emails.set(canonical, canonical,); }
  return { emails, allowed: readAllowedTrailers(), };
}

/** One trailer line -> its claimed email, or "" when the line names none. */
function trailerEmail(line,) {
  return emailOf(CO_AUTHOR_RE.exec(line,)?.[1] ?? "",);
}

// A CRLF message left a trailing \r per line, which the anchored trailer regex
// never matched — a CRLF commit read clean.
function linesOf(message,) {
  return message.replace(/\r\n?/g, "\n",).split("\n",);
}

export function auditCommits(commits, population,) {
  const findings = [];
  for (const commit of commits) {
    const own = new Set([emailOf(commit.ident,), emailOf(commit.committer,),],);
    const lines = linesOf(commit.message,);
    for (const line of lines) {
      const email = trailerEmail(line,);
      if (email === "") { continue; // no email claimed — nothing to verify against
       }
      if (own.has(email,)) { continue; // the commit's own identity
       }
      if (population.emails.has(email,)) { continue; // real participant in the range
       }
      const lower = line.toLowerCase();
      if (population.allowed.some((frag,) => lower.includes(frag,))) { continue; }
      findings.push({
        sha: commit.sha,
        subject: lines[0] ?? "",
        email,
        trailer: CO_AUTHOR_RE.exec(line,)?.[1].trim() ?? "",
      },);
    }
  }
  return findings;
}

function report(findings, commits,) {
  const population = [
    ...new Set(commits.flatMap((c,) => [emailOf(c.ident,), emailOf(c.committer,),]),),
  ].filter((e,) => e !== "");
  console.error("co-author-trailers: REFUSED — unattributed Co-Authored-By trailer(s):",);
  for (const f of findings) {
    console.error(`  ${f.sha.slice(0, 9,)} ${f.subject}`,);
    console.error(`    Co-Authored-By: ${f.trailer}`,);
  }
  console.error(
    `  Author/committer population in range: ${population.length === 0 ? "(empty)" : population.join(", ",)}`,
  );
  console.error(
    "  Fix: drop the trailer, or let the real author commit — giwt keeps real " +
      "co-authors on a finalize squash; this trailer names nobody who authored it.",
  );
}

/** Range audited when only a message is checked: this branch's unmerged work. */
function defaultRange() {
  // A fresh repo has no HEAD, and an empty range is the honest answer there.
  // `--verify -q` yields empty stdout then; plain `rev-parse HEAD` echoes the
  // literal "HEAD" on stdout.
  const head = readGit(["rev-parse", "--verify", "-q", "HEAD",], [0, 1,],).trim();
  if (head === "") { return ""; }
  const branch = readGit(["rev-parse", "--abbrev-ref", "HEAD",], [0, 1,],).trim();
  const BASE_BRANCHES = ["dev", "main", "master",];
  if (BASE_BRANCHES.includes(branch,)) {
    return "HEAD~1..HEAD";
  }

  for (const base of BASE_BRANCHES) {
    if (branch === base) { continue; }
    const verify = Bun.spawnSync(["git", "rev-parse", "--verify", "-q", base,], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    if (verify.exitCode !== 0) { continue; }
    const mergeBase = Bun.spawnSync(["git", "merge-base", base, "HEAD",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    const sha = new TextDecoder().decode(mergeBase.stdout,).trim();
    if (sha) { return `${sha}..${head}`; }
  }
  return "HEAD~1..HEAD";
}

function main() {
  // Mode is explicit, never inferred from stdin: pre-commit runs with empty
  // stdin, and inferring "message mode" from that made it audit nothing while
  // reporting success.
  const rangeArg = process.argv.indexOf("--range",);
  const range = rangeArg !== -1
    ? (process.argv[rangeArg + 1] ?? defaultRange())
    : defaultRange();
  const commits = collectCommits(range,);

  // POPULATION (who may be claimed) and AUDITED SET (which messages are
  // inspected) differ. Widening the audited set on an empty range re-audited
  // 150 commits of dev history and blocked every fresh branch on dev's own 14
  // old trailers. Population may widen; the audited set never does — and an
  // empty range has nothing to widen into.
  const populationCommits = commits.length > 0 || range === ""
    ? commits
    : collectCommits(range.endsWith("..HEAD",) ? `${range.split("..",)[0]}~150` : "HEAD~150",);
  const population = buildPopulation(populationCommits,);

  const audited = rangeArg === -1
    ? [{ sha: "HEAD", ident: "", committer: "", message: readFileSync(0, "utf8",), },]
    : commits;

  const findings = auditCommits(audited, population,);
  if (findings.length === 0) {
    console.log(
      `co-author-trailers: clean (${audited.length} message(s) audited against ${population.emails.size} known identity(ies))`,
    );
    return;
  }
  report(findings, commits,);
  process.exit(1,);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error("co-author-trailers check failed:", error.message,);
    process.exit(2,);
  }
}
