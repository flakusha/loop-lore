// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { checkUnreleasedSubheadings, compareVersions, parseSections, } from "./check-changelog.js";

/**
 * CLI contract for scripts/check-changelog.ts.
 *
 * Every case spawns the script as a child process: `runScript` exits the
 * process on a parse error or on `--help`, so it cannot be asserted in-process.
 *
 * RESOURCE CONTRACT — this suite owns NOTHING and allocates NO fixture:
 * - The script only READS `CHANGELOG.md` and the repo-global `git tag` list.
 *   It writes no file, creates no temp dir, opens no port, and takes no DB.
 * - No repo path is written by any case, so there is no teardown to perform
 *   and a failed case cannot poison the rest of the run.
 * - `CHANGELOG.md` and the tag list are read-only shared state: the whole
 *   repo reads them, and nothing under `scripts/`, `src/`, or `node_modules/giwt`
 *   writes `CHANGELOG.md`, so no concurrent gate or test can move them
 *   underneath this suite.
 * - Cases are order-independent and each spawns its own child process; none
 *   depends on another's output.
 * - Verified: 6 concurrent copies of this file all exit 0 (5 pass / 0 fail
 *   each) with `CHANGELOG.md` and `docs/reference/openapi.json` byte-identical
 *   afterwards, and the gate passes alongside the `api - doc drift` gate (the
 *   one gate that writes a shared artifact) running at the same time.
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

describe("release-candidate versions", () => {
  test("rc sections parse with base + suffix intact", () => {
    const { sections, errors, } = parseSections(
      ["## [0.1.0-rc.1] - 2026-11-22", "", "- staged",].join("\n",).split("\n",),
    );
    expect(errors,).toEqual([],);
    expect(sections,).toHaveLength(1,);
    expect(sections[0]!.version,).toBe("0.1.0-rc.1",);
  });

  test("stable sorts above its own candidates, candidates by N", () => {
    expect(compareVersions("0.1.0", "0.1.0-rc.1",),).toBeGreaterThan(0,);
    expect(compareVersions("0.1.0-rc.1", "0.1.0",),).toBeLessThan(0,);
    expect(compareVersions("0.1.0-rc.2", "0.1.0-rc.1",),).toBeGreaterThan(0,);
    expect(compareVersions("0.1.0-rc.1", "0.1.0-rc.1",),).toBe(0,);
    expect(compareVersions("0.2.0-rc.1", "0.1.0",),).toBeGreaterThan(0,);
  });

  test("stable and rc sections both parse side by side", () => {
    const { errors, } = parseSections(
      ["## [0.1.0] - 2026-11-23", "", "## [0.1.0-rc.1] - 2026-11-22", "",].join("\n",).split("\n",),
    );
    expect(errors,).toEqual([],);
  });
});
