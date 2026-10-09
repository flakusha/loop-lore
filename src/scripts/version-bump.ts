// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 320

/**
 * Version management - Git tags are the single source of truth (bare `x.y.z`,
 * no `v` prefix). package.json is updated ONLY during release (--bump), never
 * during prediction. Run with --help for full usage.
 */

import { execSync, } from "child_process";
import { resolve, } from "path";
import {
  choice,
  flag,
  object,
  option,
  optional,
  runScript,
  withDefault,
} from "../cli/parser";
import { createLogger, getChildLogger, type Logger, } from "../logger";
import {
  readPackageJsonOrNull,
  setPackageJsonVersion as writePackageJsonVersion,
} from "../utils/package-json";

// Console-only logger: `bun run version` is a bare process with no host server
// to have seeded a logger already.
createLogger({ level: "info", },);

/**
 * Module logger accessor — null if no logger is initialized.
 * @returns the child logger, or null when no logger is initialized.
 */
const log = (): Logger | null => getChildLogger("scripts/version-bump",);

interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * @param version - bare version string like `"1.2.3"` or `"1.2.3-rc.1"`
 * @returns parsed `Version` object (`major`, `minor`, `patch`, optional `prerelease`).
 * @throws {Error} when the input does not match `x.y.z[-(...)]`.
 */
function parseVersion(version: string,): Version {
  const match = /(\d+)\.(\d+)\.(\d+)(?:-(.+))?/.exec(version,);
  if (!match) { throw new Error(`Invalid version: ${version}`,); }
  return {
    major: parseInt(match[1]!,),
    minor: parseInt(match[2]!,),
    patch: parseInt(match[3]!,),
    prerelease: match[4],
  };
}

/**
 * @param v - parsed `Version` object
 * @returns canonical bare version string (`x.y.z` or `x.y.z-prerelease`).
 */
function formatVersion(v: Version,): string {
  return v.prerelease
    ? `${v.major}.${v.minor}.${v.patch}-${v.prerelease}`
    : `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * @param major - optional major version filter (`undefined` returns latest overall)
 * @returns latest matching tag string, or `null` if none found / `git` failed.
 */
function getLatestTag(major?: number,): string | null {
  try {
    // Bare `x.y.z` tags (no `v` prefix). `dev-*` tags never match.
    const pattern = major === undefined ? "^[0-9]" : `^${major}\\.`;
    const tag = execSync(
      `git tag | grep "${pattern}" | sort -t. -k1 -k2 -k3 -n | tail -1`,
      { encoding: "utf-8", },
    ).trim();

    if (tag) { return tag; }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param tag - tag name (inclusive lower bound for commit range)
 * @returns array of commit subject lines; empty array on `git` failure.
 */
function getCommitsSinceTag(tag: string,): string[] {
  try {
    const range = tag ? `${tag}..HEAD` : "";
    const result = execSync(
      `git log --pretty=format:%s --no-merges ${range}`,
      { encoding: "utf-8", },
    );

    return result.split("\n",).filter(Boolean,);
  } catch {
    return [];
  }
}

/**
 * @param commits - commit subject lines since the last tag
 * @returns suggested bump (`"major"` for breaking feat/refactor, `"minor"` for feat, `"patch"` for fix), or `null` when no conventional-commit signal.
 */
function determineBump(commits: string[],): "major" | "minor" | "patch" | null {
  let hasMajor = false;
  let hasMinor = false;
  let hasPatch = false;

  for (const commit of commits) {
    const match = /^(\w+)(?:\(([^)]+)\))?(!)?:\s(.+)$/.exec(commit,);
    if (!match) { continue; }

    const type = match[1];
    const breaking = match[3] === "!";

    if (breaking && (type === "feat" || type === "refactor")) {
      hasMajor = true;
    } else if (type === "feat") {
      hasMinor = true;
    } else if (type === "fix") {
      hasPatch = true;
    }
  }

  if (hasMajor) { return "major"; }
  if (hasMinor) { return "minor"; }
  if (hasPatch) { return "patch"; }
  return null;
}

/**
 * @returns current git branch name (e.g. `"main"`, `"dev"`, `"feature/foo"`).
 */
function getCurrentBranch(): string {
  return execSync("git branch --show-current", { encoding: "utf-8", },).trim();
}

/**
 * @returns the version pinned in `package.json`, or "0.0.0" if missing/unparseable.
 *
 * Reads use a lenient helper that returns `null` for missing/malformed
 * input — appropriate for version prediction during feature-branch
 * releases. Writes go through the throwing path (see
 * {@link writePackageJsonVersion}) so a corrupt package.json surfaces
 * loudly instead of being silently overwritten with a stub.
 */
function getPackageJsonVersion(): string {
  const packageJsonPath = resolve(import.meta.dir, "../../package.json",);
  return readPackageJsonOrNull(packageJsonPath,)?.version ?? "0.0.0";
}

/**
 * @param version - new version string to write to `package.json`
 */
function setPackageJsonVersion(version: string,): void {
  const packageJsonPath = resolve(import.meta.dir, "../../package.json",);
  writePackageJsonVersion(packageJsonPath, version,);
}

// Get version from latest tag (source of truth)
/**
 * @returns bare version string from the latest matching tag, or `"0.0.0"` when no tag exists.
 */
function getTagVersion(): string {
  const latestTag = getLatestTag();
  if (latestTag) {
    return latestTag; // bare `x.y.z` — no prefix to strip
  }

  return "0.0.0";
}

// Predict next version based on commits since latest tag
/**
 * Predict the next version based on conventional-commit signals since the latest tag.
 * @returns bare version string; feature branches get `x.y.z-dev.YYYYMMDD.sha` dev suffix.
 */
function predictVersion(): string {
  const latestTag = getLatestTag();
  const commits = getCommitsSinceTag(latestTag || "",);
  const bump = determineBump(commits,);

  const baseVersion = latestTag ? parseVersion(latestTag,) : { major: 0, minor: 0, patch: 0, };
  const branch = getCurrentBranch();
  const isMaster = branch === "master" || branch === "main";
  const releaseMatch = branch.match(/^release\/(\d+)/,);
  const releaseMajor = releaseMatch ? parseInt(releaseMatch[1]!,) : null;
  const targetMajor = releaseMajor ?? baseVersion.major;

  // Feature branch -> dev version
  if (!isMaster && !releaseMajor) {
    const date = new Date().toISOString().slice(0, 10,).replaceAll("-", "",);
    const commitSha = execSync("git rev-parse --short=7 HEAD", { encoding: "utf-8", },).trim();
    return formatVersion({
      ...baseVersion,
      prerelease: `${baseVersion.major}.${baseVersion.minor}.${baseVersion.patch}-dev.${date}.${commitSha}`,
    },);
  }

  // No commits since tag -> current tag version
  if (!bump) {
    return formatVersion({ ...baseVersion, major: targetMajor, },);
  }

  // Find latest tag in target major series
  const latestInSeries = getLatestTag(targetMajor,);
  const base = latestInSeries ? parseVersion(latestInSeries,) : { major: targetMajor, minor: 0, patch: 0, };

  if (bump === "major") {
    return formatVersion({ major: base.major + 1, minor: 0, patch: 0, },);
  }

  if (bump === "minor") {
    return formatVersion({ ...base, minor: base.minor + 1, patch: 0, },);
  }

  return formatVersion({ ...base, patch: base.patch + 1, },);
}

// Bump version: update package.json; create tag ONLY with explicit --tag flag
/**
 * @param bumpType - bump level (`"major"` | `"minor"` | `"patch"`)
 * @param shouldTag - whether to create + push an annotated git tag (`--tag` flag)
 * @returns the new version string written to `package.json`.
 */
function bumpVersion(bumpType: "major" | "minor" | "patch", shouldTag: boolean,): string {
  const latestTag = getLatestTag();
  const baseVersion = latestTag ? parseVersion(latestTag,) : { major: 0, minor: 0, patch: 0, };

  // Validate bump type matches prediction
  const actualBump = determineBump(getCommitsSinceTag(latestTag || "",),);
  if (actualBump && actualBump !== bumpType) {
    log()?.warn("commits suggest a different bump than requested", { suggested: actualBump, requested: bumpType, },);
  }

  let nextVersion: Version;
  if (bumpType === "major") {
    nextVersion = { major: baseVersion.major + 1, minor: 0, patch: 0, };
  } else if (bumpType === "minor") {
    nextVersion = { ...baseVersion, minor: baseVersion.minor + 1, patch: 0, };
  } else {
    nextVersion = { ...baseVersion, patch: baseVersion.patch + 1, };
  }

  const next = formatVersion(nextVersion,);

  // Release narration for the operator running the command: these lines
  // report what just changed on disk / in the remote, not a diagnostic.
  // eslint-disable-next-line no-console
  console.log(`Bumping ${getTagVersion()} → ${next} (${bumpType})`,);
  setPackageJsonVersion(next,);

  if (shouldTag) {
    // Tagging is a post-testing human decision — only the explicit --tag flag
    // may create one. Agents must never run with --tag.
    // Release narration, see above.
    // eslint-disable-next-line no-console
    console.log(`Creating tag: ${next}`,);
    execSync(`git tag -a "${next}" -m "Release ${next}"`, { stdio: "inherit", },);
    execSync(`git push origin "${next}"`, { stdio: "inherit", },);
  } else {
    // Release narration, see above.
    // eslint-disable-next-line no-console
    console.log("package.json updated — tag NOT created (tagging = post-testing human decision; add --tag to tag)",);
  }

  return next;
}

// Sync package.json to latest tag (for CI/CD)
/** */
function syncPackageJson(): void {
  const tagVersion = getTagVersion();
  const pkgVersion = getPackageJsonVersion();

  if (tagVersion === pkgVersion) {
    // CI-facing report of the current state.
    // eslint-disable-next-line no-console
    console.log(`package.json already in sync (${pkgVersion})`,);
    return;
  }

  // CI-facing report of the current state.
  // eslint-disable-next-line no-console
  console.log(`Syncing package.json: ${pkgVersion} → ${tagVersion}`,);
  setPackageJsonVersion(tagVersion,);
}

interface CliArgs {
  readonly command: "sync" | "bump" | "predict";
  readonly type?: "major" | "minor" | "patch";
  readonly tag?: boolean;
}

function parseCliArgs(): CliArgs {
  const parser = object({
    sync: withDefault(flag("--sync",), false,),
    type: optional(option("--bump", choice(["major", "minor", "patch",] as const,),),),
    tag: withDefault(flag("--tag",), false,),
  },);

  const args = runScript(parser, {
    programName: "version",
    brief: "Predict, bump, or sync the package.json version (git tag is source of truth).",
    description: "Default action is `predict` — prints the next version without modifying anything.",
    examples:
      "version                       # predict next version\n  version --bump=minor           # update package.json (no tag)\n  version --bump=minor --tag     # update + create annotated tag + push\n  version --sync                 # CI: sync package.json to latest tag",
    showDefault: true,
    help: "option",
  },);

  const command: CliArgs["command"] = args.sync
    ? "sync"
    : args.type !== undefined
    ? "bump"
    : "predict";

  return { command, type: args.type, tag: args.tag, };
}

function main(): void {
  const args = parseCliArgs();
  switch (args.command) {
    case "sync":
      syncPackageJson();
      return;
    case "bump":
      bumpVersion(args.type ?? "patch", args.tag ?? false,);
      return;
    case "predict":
      // Machine-readable output: `bun run version` prints the bare predicted
      // version for shell consumers to capture verbatim.
      // eslint-disable-next-line no-console
      console.log(predictVersion(),);
      return;
  }
}

main();
// The log queue batches on a 100ms timer and its timer is unref'd, so nothing
// keeps the process alive long enough to drain it — flush explicitly. A transport
// rejection must not turn a successful run into a failing exit.
await log()?.flush().catch(() => undefined);
