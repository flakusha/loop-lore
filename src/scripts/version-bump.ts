/**
 * Version management - Git tags are the single source of truth (bare `x.y.z`,
 * no `v` prefix). package.json is updated ONLY during release (--bump), never
 * during prediction.
 *
 * Usage:
 *   bun run version:predict              # Show predicted next version (reads tags only)
 *   bun run version:bump --bump=minor    # Bump + update package.json (NO tag)
 *   bun run version:bump --bump=minor --tag   # + create annotated tag + push
 *   bun run version:sync                 # Sync package.json to latest tag (CI/CD)
 *
 * Tag creation requires the explicit `--tag` flag — tagging is a post-testing
 * human decision; agents must never create tags.
 */

import { execSync, } from "child_process";
import { readFileSync, writeFileSync, } from "fs";
import { resolve, } from "path";

interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

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

function formatVersion(v: Version,): string {
  return v.prerelease
    ? `${v.major}.${v.minor}.${v.patch}-${v.prerelease}`
    : `${v.major}.${v.minor}.${v.patch}`;
}

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

function getCurrentBranch(): string {
  return execSync("git branch --show-current", { encoding: "utf-8", },).trim();
}

function getPackageJsonVersion(): string {
  const packageJsonPath = resolve(import.meta.dir, "../../package.json",);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8",),);
  return packageJson.version;
}

function setPackageJsonVersion(version: string,): void {
  const packageJsonPath = resolve(import.meta.dir, "../../package.json",);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8",),);
  packageJson.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2,)}\n`,);
}

// Get version from latest tag (source of truth)
function getTagVersion(): string {
  const latestTag = getLatestTag();
  if (latestTag) {
    return latestTag; // bare `x.y.z` — no prefix to strip
  }
  return "0.0.0";
}

// Predict next version based on commits since latest tag
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
function bumpVersion(bumpType: "major" | "minor" | "patch", shouldTag: boolean,): string {
  const latestTag = getLatestTag();
  const baseVersion = latestTag ? parseVersion(latestTag,) : { major: 0, minor: 0, patch: 0, };

  // Validate bump type matches prediction
  const actualBump = determineBump(getCommitsSinceTag(latestTag || "",),);
  if (actualBump && actualBump !== bumpType) {
    console.warn(`Warning: commits suggest ${actualBump} bump, but --bump=${bumpType} requested`,);
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

  console.log(`Bumping ${getTagVersion()} → ${next} (${bumpType})`,);
  setPackageJsonVersion(next,);

  if (shouldTag) {
    // Tagging is a post-testing human decision — only the explicit --tag flag
    // may create one. Agents must never run with --tag.
    console.log(`Creating tag: ${next}`,);
    execSync(`git tag -a "${next}" -m "Release ${next}"`, { stdio: "inherit", },);
    execSync(`git push origin "${next}"`, { stdio: "inherit", },);
  } else {
    console.log("package.json updated — tag NOT created (tagging = post-testing human decision; add --tag to tag)",);
  }

  return next;
}

// Sync package.json to latest tag (for CI/CD)
function syncPackageJson(): void {
  const tagVersion = getTagVersion();
  const pkgVersion = getPackageJsonVersion();

  if (tagVersion === pkgVersion) {
    console.log(`package.json already in sync (${pkgVersion})`,);
    return;
  }

  console.log(`Syncing package.json: ${pkgVersion} → ${tagVersion}`,);
  setPackageJsonVersion(tagVersion,);
}

function main(): void {
  const args = Bun.argv.slice(2,);
  const command = args[0];

  if (command === "--sync") {
    syncPackageJson();
    return;
  }

  if (command === "--bump") {
    const bumpType = args.find((a,) => a.startsWith("--bump=",))?.split("=",)[1] as "major" | "minor" | "patch";
    if (!bumpType || !["major", "minor", "patch",].includes(bumpType,)) {
      console.error("Usage: version:bump --bump=major|minor|patch [--tag]",);
      process.exit(1,);
    }
    const shouldTag = args.includes("--tag",);
    bumpVersion(bumpType, shouldTag,);
    return;
  }

  // Default: predict
  console.log(predictVersion(),);
}

main();
