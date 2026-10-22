// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The jscpd ignore list is ONE definition read by the gate and by the
 * package.json scripts. These tests pin that: the widened entries survive,
 * the gate's command carries the shared list, and the scripts cannot smuggle
 * a second list back in. A gate that measures a different scan than the one
 * that was fixed is exactly the defect this module exists to end.
 */
import { expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import path from "node:path";
import { JSCPD_IGNORE, jscpdScanArgs, jscpdScanCommand, } from "./jscpd-scan.mjs";
import { checks, } from "./parallel/gates.mjs";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..",);

/** The entries dev's commit 74336a7fb added to package.json's list only. */
const WIDENED = ["**/views/*.html", "frontend/alpine/**", "validation/schemas/*", "db/schema-*.ts",];

test("the shared list keeps the widened entries", () => {
  for (const entry of WIDENED) {
    expect(JSCPD_IGNORE,).toContain(entry,);
  }
});

test("the gate's command carries the shared ignore list", () => {
  const command = checks["jscpd ratchet"] ?? "";
  expect(command,).toContain(JSCPD_IGNORE.join(",",),);
  for (const entry of WIDENED) {
    expect(command,).toContain(entry,);
  }
});

test("the CLI arguments carry the same list as the command string", () => {
  const args = jscpdScanArgs({ minLines: 4, minTokens: 30, reporters: "json", output: ".tmp/x", },);
  expect(args,).toContain(JSCPD_IGNORE.join(",",),);
  expect(jscpdScanCommand({ minLines: 4, minTokens: 30, reporters: "json", output: ".tmp/x", },),)
    .toContain(JSCPD_IGNORE.join(",",),);
});

test("the package.json scripts call the shared scan and carry no ignore list of their own", () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json",), "utf8",),);
  for (const name of ["jscpd", "jscpd:full",]) {
    const script = pkg.scripts[name] ?? "";
    expect(script, name,).toContain("scripts/check/jscpd-scan.mjs",);
    expect(script, name,).not.toContain("--ignore",);
  }
  // The gate scans at the `jscpd:full` thresholds; the scripts must not
  // drift to a third set of numbers.
  expect(pkg.scripts["jscpd:full"],).toContain("--min-lines 4 --min-tokens 30",);
  expect(pkg.scripts.jscpd,).toContain("--min-lines 8 --min-tokens 100",);
});
