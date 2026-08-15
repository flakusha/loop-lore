// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Changelog gate.
 *
 * Enforces Keep-a-Changelog structure on `CHANGELOG.md` (single source of
 * truth for release notes — GitHub release notes are derived from it, never
 * re-parsed from `git log`).
 *
 * Checks:
 *  1. `## [Unreleased]` section exists.
 *  2. Every released section matches `## [x.y.z] - YYYY-MM-DD`.
 *  3. Sections are newest-first (descending semver, `[Unreleased]` on top).
 *  4. No duplicate version sections.
 *  5. If the latest `x.y.z` git tag (bare, no `v` prefix) exists, CHANGELOG
 *     must already contain a matching section (prevents releasing with a
 *     stale changelog).
 *
 * Usage:
 *   bun run scripts/check-changelog.ts
 *   bun run scripts/check-changelog.ts --ignore-tag   # skip the tag check
 */

import { execSync, } from "node:child_process";
import { readFileSync, } from "node:fs";
import { resolve, } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "..",);
const CHANGELOG_PATH = resolve(PROJECT_ROOT, "CHANGELOG.md",);

interface Section {
  version: string | null; // null for [Unreleased]
  date: string | null;
  line: number;
}

const VERSION_RE = /^## \[(\d+\.\d+\.\d+)\]\s+-\s+(\d{4}-\d{2}-\d{2})$/;
const UNRELEASED_RE = /^## \[Unreleased\]$/;

function parseSections(lines: string[],): { sections: Section[]; errors: string[] } {
  const sections: Section[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index,) => {
    const unreleased = UNRELEASED_RE.exec(line,);
    if (unreleased) {
      sections.push({ version: null, date: null, line: index + 1, },);
      return;
    }
    const match = VERSION_RE.exec(line,);
    if (!match) { return; }
    const version = match[1]!;
    if (seen.has(version,)) {
      errors.push(`duplicate version section [${version}] (line ${index + 1})`,);
      return;
    }
    seen.add(version,);
    sections.push({ version, date: match[2], line: index + 1, },);
  },);

  return { sections, errors, };
}

function compareVersions(a: string, b: string,): number {
  const pa = a.split(".",).map(Number,);
  const pb = b.split(".",).map(Number,);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) { return diff; }
  }
  return 0;
}

function checkOrdering(sections: Section[],): string[] {
  const errors: string[] = [];
  const released = sections.filter((s,) => s.version !== null);
  for (let i = 1; i < released.length; i++) {
    const prev = released[i - 1]!;
    const curr = released[i]!;
    if (compareVersions(prev.version!, curr.version!,) <= 0) {
      errors.push(
        `sections out of order: [${prev.version}] (line ${prev.line}) must be newer than [${curr.version}] (line ${curr.line})`,
      );
    }
  }
  return errors;
}

function latestGitTag(): string | null {
  try {
    // Bare `x.y.z` tags (no `v` prefix); `dev-*` tags never match.
    const tag = execSync(
      `git tag | grep "^[0-9]" | sort -t. -k1 -k2 -k3 -n | tail -1`,
      { encoding: "utf-8", cwd: PROJECT_ROOT, },
    ).trim();
    return tag === "" ? null : tag;
  } catch {
    return null;
  }
}

function main(): void {
  const ignoreTag = process.argv.includes("--ignore-tag",);
  let content: string;
  try {
    content = readFileSync(CHANGELOG_PATH, "utf-8",);
  } catch {
    console.error("changelog - gate: FAIL — CHANGELOG.md not found",);
    process.exit(1,);
  }

  const lines = content.split("\n",);
  const { sections, errors, } = parseSections(lines,);

  const unreleased = sections.find((s,) => s.version === null);
  if (!unreleased) {
    errors.push("missing `## [Unreleased]` section (Keep a Changelog)",);
  }

  errors.push(...checkOrdering(sections,),);

  const latestTag = ignoreTag ? null : latestGitTag();
  if (latestTag) {
    // Bare tags: no prefix to strip
    const hasSection = sections.some((s,) => s.version === latestTag);
    if (!hasSection) {
      errors.push(
        `latest tag ${latestTag} has no CHANGELOG section — update CHANGELOG.md before tagging`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(`changelog - gate: FAIL (${errors.length})`,);
    for (const err of errors) { console.error(`  - ${err}`,); }
    process.exit(1,);
  }

  const versionCount = sections.filter((s,) => s.version !== null).length;
  console.log(`changelog - gate: OK — [Unreleased] present, ${versionCount} version section(s)`,);
}

main();
