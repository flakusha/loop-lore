// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Validate commit messages against conventional commit format.
 *
 * Usage:
 *   bun run commit:lint              # Check commits since last tag
 *   bun run commit:lint --all        # Check all commits (same as default)
 *   cat .git/COMMIT_EDITMSG | bun run commit:lint  # Validate single commit (hook mode)
 *
 * Only validates TYPE - scope and length are warnings, not errors.
 * Supports: type(scope): subject, type!: subject (breaking change)
 */

import { execSync, } from "child_process";
import { flag, object, runScript, withDefault, } from "../cli/parser";
import { createLogger, getLogger, type Logger, } from "../logger";

// Console-only logger: the githook runs this file as a bare process, with no
// host server to have seeded a logger already.
createLogger({ level: "info", },);

/**
 * Module logger accessor — null if no logger is initialized.
 * @returns the child logger, or null when no logger is initialized.
 */
function log(): Logger | null {
  try {
    return getLogger().child({ module: "scripts/commit-check", },);
  } catch {
    return null;
  }
}

const COMMIT_PATTERN = /^(\w+)(?:\(([^)]+)\))?(!)?:\s(.+)$/;
const VALID_TYPES = [
  "feat",
  "fix",
  "refactor",
  "chore",
  "test",
  "docs",
  "style",
  "perf",
  "build",
  "ci",
  "revert",
];

const RECOMMENDED_SCOPES = [
  "core",
  "db",
  "routes",
  "router",
  "server",
  "middleware",
  "config",
  "logger",
  "transport",
  "assets",
  "story",
  "generation",
  "generation-pipeline",
  "providers",
  "actors",
  "actor-notes",
  "actor-items",
  "actor-memories",
  "actor-lore",
  "worlds",
  "locations",
  "items",
  "quests",
  "chats",
  "messages",
  "characters",
  "api-keys",
  "auth",
  "settings",
  "users",
  "sessions",
  "frontend",
  "tui",
  "ui",
  "views",
  "htmx",
  "alpine",
  "css",
  "build",
  "deps",
  "security",
  "crypto",
  "testing",
  "e2e",
  "release",
];

interface CommitInfo {
  message: string;
  valid: boolean;
  warnings: string[];
}

/**
 * @param message - raw commit message (may include body lines)
 * @returns CommitInfo with `valid` flag and any `warnings` (long subject, invalid scope/type, trailing period, etc.).
 */
function validateCommit(message: string,): CommitInfo {
  const firstLine = message.trim().split("\n",)[0];
  if (!firstLine) {
    return { message: "", valid: false, warnings: ["Empty commit message",], };
  }

  const warnings: string[] = [];
  const match = COMMIT_PATTERN.exec(firstLine,);

  if (!match) {
    return {
      message: firstLine,
      valid: false,
      warnings: [`Invalid format: "${firstLine}" - expected "type(scope): subject"`,],
    };
  }

  const [, type, scope, , subject,] = match;

  if (!VALID_TYPES.includes(type!,)) {
    warnings.push(`Invalid type "${type!}" - must be one of: ${VALID_TYPES.join(", ",)}`,);
  }

  if (scope && !RECOMMENDED_SCOPES.includes(scope,)) {
    warnings.push(`Unrecognized scope "${scope}" - consider: ${RECOMMENDED_SCOPES.join(", ",)}`,);
  }

  if (subject!.length > 72) {
    warnings.push(`Subject long: ${subject!.length}/72 characters`,);
  }

  if (subject!.endsWith(".",)) {
    warnings.push(`Subject has trailing period`,);
  }

  // Only fail on invalid type
  const hasTypeError = !VALID_TYPES.includes(type!,);
  return { message: firstLine, valid: !hasTypeError, warnings, };
}

/**
 * @param text - text to colorize
 * @returns text wrapped in ANSI green escape codes (terminal-friendly).
 */
function green(text: string,): string {
  return `\x1b[32m${text}\x1b[0m`;
}

/**
 * Collect all commit subject lines since the last git tag (or all commits if no tag exists).
 * @returns array of commit subject strings; empty array on `git` failure.
 */
function getCommitsSinceLastTag(): string[] {
  try {
    const tag = execSync("git describe --tags --abbrev=0 2>/dev/null || echo ''", {
      encoding: "utf-8",
    },).trim();

    const range = tag ? `${tag}..HEAD` : "";
    const result = execSync(`git log --pretty=format:%s --no-merges ${range}`, { encoding: "utf-8", },);
    return result.split("\n",).filter(Boolean,);
  } catch {
    return [];
  }
}

/**
 * Entry point. Validates commits against conventional-commit rules; exits 0 on success, 1 on any invalid commit.
 * @returns resolves when validation completes (exit is via `process.exit`).
 */
async function main(): Promise<void> {
  const parser = object({
    all: withDefault(flag("--all", "--staged",), false,),
  },);

  const args = runScript(parser, {
    programName: "commit-check",
    brief: "Validate commits against conventional-commit rules (used as githook).",
    help: "option",
  },);

  const hookMode = !args.all && !process.stdin.isTTY;

  // Hook mode: read single commit from stdin
  if (hookMode) {
    const input = await Bun.stdin.text();
    const commitInfo = validateCommit(input,);
    if (commitInfo.valid) {
      process.exit(0,);
    }

    // The hook lets stdout through to the developer's terminal (it only reads
    // the exit code), so the rejection reasons stay a direct human report.
    // eslint-disable-next-line no-console
    console.log("Invalid commit message:",);
    for (const warn of commitInfo.warnings) {
      // eslint-disable-next-line no-console
      console.log(`  ${warn}`,);
    }

    process.exit(1,);
  }

  // Normal mode: check commits
  const commits = getCommitsSinceLastTag();

  if (commits.length === 0) {
    // ANSI green is a terminal affordance; a structured log line would carry
    // the escape codes as noise.
    // eslint-disable-next-line no-console
    console.log(green("No commits to validate",),);
    process.exit(0,);
  }

  const results = commits.map((msg,) => validateCommit(msg,));
  const failures = results.filter((r,) => !r.valid);

  if (failures.length === 0) {
    // ANSI green is terminal-only output.
    // eslint-disable-next-line no-console
    console.log(green(`${commits.length} commits valid`,),);
    process.exit(0,);
  }

  // Human-readable report of which commits failed and why; `bun run commit:lint`
  // is read by a person fixing their history, so it stays on stdout verbatim.
  // eslint-disable-next-line no-console
  console.log("Invalid commits found:",);
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.log(`  ${f.message}`,);
    for (const warn of f.warnings) {
      // eslint-disable-next-line no-console
      console.log(`    ${warn}`,);
    }
  }

  process.exit(1,);
}

main().catch(async (error: unknown,) => {
  const msg = error instanceof Error ? error.message : String(error,);
  log()?.error(msg, error instanceof Error ? error : undefined,);
  // The log queue batches on a 100ms timer; drain it before the exit takes
  // the queued diagnostic down with the process. A transport rejection must
  // not skip the exit — the hook branches on the exit code.
  await log()?.flush().catch(() => undefined);
  process.exit(1,);
},);
