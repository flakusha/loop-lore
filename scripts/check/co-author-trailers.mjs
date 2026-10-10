#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Co-Authored-By trailer check — a trailer is only attribution if the identity
 * it names actually participates in the commits.
 *
 * The defect this exists for: commits in the finalization set carried
 * `Co-Authored-By:` lines for identities that author or commit nothing
 * anywhere (`omp-agent <omp-agent@localhost>`, `ai <ai@loop-lore.local>`,
 * `OpenCode Space Bunny <noreply@opencode.ai>`, `archivist-agent`,
 * `agent@loop-lore.dev` — 14 such trailers on dev, none of those emails
 * present in the author/committer population). The trailer asserts someone
 * wrote code they did not write.
 *
 * Semantics — deliberately conservative, only flag on a total miss:
 *   - email is the primary key and a match is proof; name is a secondary
 *     signal only, never sufficient on its own;
 *   - a trailer matching its own commit's author/committer always passes;
 *   - `Signed-off-by:` / `Reviewed-by:` are out of scope — only
 *     `Co-Authored-By:` lines are parsed;
 *   - a trailer naming the repo-canonical identity passes (the
 *     `Konstantin Fedotov (Agent) <zenflak@gmail.com>` shape on 103 commits);
 *   - `ALLOWED_TRAILERS` fragments from .credentials.env are the repo's
 *     existing consent mechanism (same rule giwt applies in
 *     `src/utils/coauthors.ts`) and keep a trailer verbatim.
 *
 * Usage:
 *   bun run scripts/check/co-author-trailers.mjs              < message
 *   bun run scripts/check/co-author-trailers.mjs --range main..HEAD
 *
 * With no arguments the commit message is read from stdin. `--range` instead
 * audits every commit message already in the range (used by the pre-commit
 * hook, which runs before a message exists to read).
 *
 * Exit codes: 0 clean, 1 offending trailers found, 2 tooling failure.
 */
import { existsSync, readFileSync, } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

/** Only this trailer type is in scope. */
const CO_AUTHOR_RE = /^[ \t]*co-authored-by:[ \t]*(.+?)[ \t]*$/i;

/**
 * git reads, via the pinned giwt passthrough first (the repo pins
 * `bun node_modules/giwt/src/cli.ts`; a harness that reroutes raw git lands
 * there too) and plain git when giwt is not installed. giwt prints a run-record
 * banner on stdout, so banner lines are dropped before parsing.
 */
const GIWT = path.join(PROJECT_ROOT, "node_modules", "giwt", "src", "cli.ts",);

function stripBanner(text,) {
  return text.split("\n",).filter((line,) => !line.startsWith("Run record:",)).join("\n",);
}

function readGit(args,) {
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
  if (proc.exitCode !== 0) {
    throw new Error(
      `git ${args[0]} failed (${hasGiwt ? "giwt then git" : "git"}): ${new TextDecoder().decode(proc.stderr,)}`,
    );
  }
  return new TextDecoder().decode(proc.stdout,);
}

/** Commit messages + resolved identity of every commit in the range. */
function collectCommits(range,) {
  const format = "--format=%x01%H%x02%an <%ae>%x02%cn <%ce>%x02%B%x03";
  const viaGiwt = parseRecords(readGit(["log", format, range,],),);
  const expected = readGit(["rev-list", "--count", range,],).trim();
  // rtk, which sits in the giwt passthrough, compacts its output: it caps at
  // 50 lines and elides fields. A compacted read parses into a record missing
  // its committer, which would audit the branch against a one-identity
  // population and call a fabricated trailer clean. Any sign of compaction —
  // short count, missing field, truncated email — re-reads raw from git.
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
  return raw.split("\x03",).map((r,) => r.replace(/^\x01/, "",)).filter((r,) => r.trim())
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

function readAllowedTrailers() {
  for (
    let dir = PROJECT_ROOT;
    dir !== path.dirname(dir,);
    dir = path.dirname(dir,)
  ) {
    const file = path.join(dir, ".credentials.env",);
    if (!existsSync(file,)) { continue; }
    const line = /^ALLOWED_TRAILERS=(.*)$/m.exec(readFileSync(file, "utf8",),)?.[1] ?? "";
    return line.split(",",).map((f,) => f.trim().toLowerCase()).filter((f,) => f !== "");
  }
  return [];
}

/**
 * Identities a trailer may legitimately claim: every author and committer in
 * the range, plus the repo-canonical config identity, plus whatever
 * .credentials.env ALLOWED_TRAILERS consents to.
 */
function buildPopulation(commits,) {
  const emails = new Map();
  for (const commit of commits) {
    for (const ident of [commit.ident, commit.committer,]) {
      const email = emailOf(ident,);
      if (email) { emails.set(email, ident,); }
    }
  }
  const canonical = readGit(["config", "--get", "user.email",],).trim().toLowerCase();
  if (canonical) { emails.set(canonical, canonical,); }
  return { emails, allowed: readAllowedTrailers(), };
}

/** One trailer line -> its claimed email, or "" when the line names none. */
function trailerEmail(line,) {
  return emailOf(CO_AUTHOR_RE.exec(line,)?.[1] ?? "",);
}

export function auditCommits(commits, population,) {
  const findings = [];
  for (const commit of commits) {
    const own = new Set([emailOf(commit.ident,), emailOf(commit.committer,),],);
    for (const line of commit.message.split("\n",)) {
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
        subject: commit.message.split("\n",)[0] ?? "",
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
  const head = readGit(["rev-parse", "HEAD",],).trim();
  const branch = readGit(["rev-parse", "--abbrev-ref", "HEAD",],).trim();
  for (const base of ["dev", "main", "master",]) {
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
  const rangeArg = process.argv.indexOf("--range",);
  const range = rangeArg === -1 ? defaultRange() : process.argv[rangeArg + 1];
  let commits = collectCommits(range,);
  // A fresh branch has an empty unmerged range; the canonical config identity
  // is then the entire population, so a fabricated trailer would pass
  // vacuously. Widen to the recent history of the range's base instead.
  if (commits.length === 0) {
    commits = collectCommits(range.endsWith("..HEAD",) ? `${range.split("..",)[0]}~150` : "HEAD~150",);
  }
  const population = buildPopulation(commits,);
  // --range audits real commits; bare stdin audits one message against the
  // same population.
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
