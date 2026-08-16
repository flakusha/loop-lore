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

function green(text: string,): string {
  return `\x1b[32m${text}\x1b[0m`;
}

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

async function main(): Promise<void> {
  const args = Bun.argv.slice(2,);
  const hookMode = !args.includes("--all",) && !process.stdin.isTTY;

  // Hook mode: read single commit from stdin
  if (hookMode) {
    const input = await Bun.stdin.text();
    const commitInfo = validateCommit(input,);
    if (commitInfo.valid) {
      process.exit(0,);
    }
    console.log("Invalid commit message:",);
    for (const warn of commitInfo.warnings) {
      console.log(`  ${warn}`,);
    }
    process.exit(1,);
  }

  // Normal mode: check commits
  const commits = getCommitsSinceLastTag();

  if (commits.length === 0) {
    console.log(green("No commits to validate",),);
    process.exit(0,);
  }

  const results = commits.map((msg,) => validateCommit(msg,));
  const failures = results.filter((r,) => !r.valid);

  if (failures.length === 0) {
    console.log(green(`${commits.length} commits valid`,),);
    process.exit(0,);
  }

  console.log("Invalid commits found:",);
  for (const f of failures) {
    console.log(`  ${f.message}`,);
    for (const warn of f.warnings) {
      console.log(`    ${warn}`,);
    }
  }

  process.exit(1,);
}

main().catch((error: unknown,) => {
  const msg = error instanceof Error ? error.message : String(error,);
  console.error(msg,);
  process.exit(1,);
},);
