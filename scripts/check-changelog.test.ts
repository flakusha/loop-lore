// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { checkUnreleasedSubheadings, } from "./check-changelog.js";

/**
 * CLI contract for scripts/check-changelog.ts.
 *
 * Every case spawns the script as a child process: `runScript` exits the
 * process on a parse error or on `--help`, so it cannot be asserted in-process.
 * The script only READS CHANGELOG.md and the git tag list, so no test owns a
 * fixture and nothing here can collide under `bun test --parallel`.
 */

const SCRIPT = `${import.meta.dir}/check-changelog.ts`;

function run(...args: string[]) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], { cwd: import.meta.dir, },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("check-changelog CLI", () => {
  test("--ignore-tag: validates the committed CHANGELOG and exits 0", () => {
    const result = run("--ignore-tag",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("changelog - gate: OK",);
  });

  test("--help prints the brief and exits 0", () => {
    const result = run("--help",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("Validate CHANGELOG.md structure",);
  });

  test("unknown flag is rejected with exit 1", () => {
    const result = run("--no-such-flag",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("--no-such-flag",);
  });

  test("duplicate ### subheading fixture is rejected", () => {
    // Pre-fix shape: the Changed block pasted verbatim a second time.
    const fixture = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "",
      "- one",
      "",
      "### Changed",
      "",
      "- two",
      "",
      "### Changed",
      "",
      "- two",
      "",
      "### Fixed",
      "",
      "- three",
    ].join("\n",);
    const errors = checkUnreleasedSubheadings(fixture.split("\n",),);
    expect(errors,).toHaveLength(1,);
    expect(errors[0],).toContain("duplicate ### Changed",);
  });

  test("single ### subheading each passes", () => {
    const fixture = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Changed",
      "",
      "- two",
      "",
      "### Fixed",
      "",
      "- three",
    ].join("\n",);
    expect(checkUnreleasedSubheadings(fixture.split("\n",),),).toEqual([],);
  });
});
