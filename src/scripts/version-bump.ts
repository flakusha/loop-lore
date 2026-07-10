/**
 * Predict next version from conventional commits.
 *
 * Supports:
 *   - master/main: semver bump (feat→minor, fix→patch, feat!→major)
 *   - release/X: stays within X major version (release/0 → 0.x.y, release/1 → 1.x.y)
 *   - feature branches: dev version (x.y.z-dev.YYYYMMDD.sha)
 *
 * Usage:
 *   bun run version:predict              # Show predicted next version
 *   bun run version:bump --bump=minor    # Bump and update package.json
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

function parseVersion(version: string): Version {
  const match = /(\d+)\.(\d+)\.(\d+)(?:-(.+))?/.exec(version);
  if (!match) throw new Error(`Invalid version: ${version}`);
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    prerelease: match[4],
  };
}

function formatVersion(v: Version): string {
  return v.prerelease
    ? `${v.major}.${v.minor}.${v.patch}-${v.prerelease}`
    : `${v.major}.${v.minor}.${v.patch}`;
}

// Parse conventional commits and determine version bump
function determineBump(commits: string[]): "major" | "minor" | "patch" | null {
  let hasMajor = false;
  let hasMinor = false;
  let hasPatch = false;

  const commitPattern = /^(\w+)(?:\(([^)]+)\))?!:\s(.+)$/;

  for (const commit of commits) {
    const match = commitPattern.exec(commit);
    if (!match) continue;

    const type = match[1];
    const breaking = commit.includes("!");

    if (breaking && (type === "feat" || type === "refactor")) {
      hasMajor = true;
    } else if (type === "feat") {
      hasMinor = true;
    } else if (type === "fix") {
      hasPatch = true;
    }
  }

  if (hasMajor) return "major";
  if (hasMinor) return "minor";
  if (hasPatch) return "patch";
  return null;
}

function getCommitsSinceLastTag(): string[] {
  try {
    const tag = execSync("git describe --tags --abbrev=0 2>/dev/null || echo ''", {
      encoding: "utf-8",
    }).trim();
    const range = tag ? `${tag}..HEAD` : "";
    const result = execSync(`git log --pretty=format:%s --no-merges ${range}`, { encoding: "utf-8" });
    return result.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// Script entry point
function main(): void {
  const args = Bun.argv.slice(2);
  const bumpMode = args.find((arg) => arg.startsWith("--bump="))?.split("=", 2)[1];

  const commits = getCommitsSinceLastTag();

  const packageJsonPath = resolve(import.meta.dir, "../../package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const currentVersion = packageJson.version;
  const parsed = parseVersion(currentVersion);

  const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
  const isMaster = branch === "master" || branch === "main";
  const releaseMatch = branch.match(/^release\/(\d+)/);
  const releaseMajor = releaseMatch ? parseInt(releaseMatch[1]) : null;
  const bump = determineBump(commits);

  // Feature branch - dev version
  if (!isMaster && !releaseMajor) {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const commitSha = execSync("git rev-parse --short=7 HEAD", { encoding: "utf-8" }).trim();
    const devVersion = formatVersion({
      ...parsed,
      prerelease: `${parsed.major}.${parsed.minor}.${parsed.patch}-dev.${date}.${commitSha}`,
    });
    console.log(devVersion);
    process.exit(0);
  }

  // Release/master branch - calculate bump within target major
  const targetMajor = releaseMajor ?? parsed.major;

  if (!bump) {
    // No commits since last tag - output current or latest in series
    try {
      const latestTag = execSync(`git tag | grep "^v${targetMajor}\\." | sort -t. -k2 -k3 -n | tail -1`, {
        encoding: "utf-8",
      }).trim();
      if (latestTag) {
        const latest = parseVersion(latestTag.slice(1));
        console.log(`No version bump (latest in ${targetMajor}.x: ${formatVersion(latest)})`);
        process.exit(0);
      }
    } catch {
      // ignore
    }
    console.log(`No version bump needed (current: ${currentVersion})`);
    process.exit(0);
  }

  // Find latest tag in target major series
  let nextVersion: Version;
  try {
    const latestTag = execSync(`git tag | grep "^v${targetMajor}\\." | sort -t. -k2 -k3 -n | tail -1`, {
      encoding: "utf-8",
    }).trim();
    if (latestTag) {
      const latest = parseVersion(latestTag.slice(1));
      if (bump === "major") {
        nextVersion = { major: latest.major + 1, minor: 0, patch: 0 };
      } else if (bump === "minor") {
        nextVersion = { ...latest, minor: latest.minor + 1, patch: 0 };
      } else {
        nextVersion = { ...latest, patch: latest.patch + 1 };
      }
    } else {
      // No existing tags in this series - start from x.0.0
      nextVersion = { major: targetMajor, minor: 0, patch: 0 };
      if (bump === "patch") {
        nextVersion.minor = 1; // First patch goes to x.0.1 (since x.0.0 is base)
      }
    }
  } catch {
    nextVersion = { ...parsed, patch: parsed.patch + 1 };
  }

  const next = formatVersion(nextVersion);

  if (bumpMode) {
    console.log(`Bumping ${currentVersion} → ${next} (${bump})`);
    packageJson.version = next;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
  } else {
    console.log(`${next} (${bump} bump)`);
  }
}

main();
