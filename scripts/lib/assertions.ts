// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, } from "node:fs";
import { basename, } from "node:path";
import { error, success, } from "../worktree/utils/colors";

export let PASS = 0;
export let FAIL = 0;

export function pass(label: string,): void {
  console.log(`  ${success("✓",)} ${label}`,);
  PASS++;
}

export function fail(label: string,): void {
  console.log(`  ${error("✗",)} ${label}`,);
  FAIL++;
}

export function assertEq(
  expected: unknown,
  actual: unknown,
  label?: string,
): void {
  if (expected === actual) {
    pass(`${label ? `${label}: ` : ""}expected '${expected}'`,);
  } else {
    fail(`${label ? `${label}: ` : ""}expected '${expected}', got '${actual}'`,);
  }
}

export function assertContains(
  haystack: string,
  needle: string,
  label?: string,
): void {
  if (haystack.includes(needle,)) {
    pass(`${label ? `${label}: ` : ""}contains '${needle}'`,);
  } else {
    fail(`${label ? `${label}: ` : ""}does not contain '${needle}'`,);
  }
}

export function assertNotContains(
  haystack: string,
  needle: string,
  label?: string,
): void {
  if (!haystack.includes(needle,)) {
    pass(`${label ? `${label}: ` : ""}does not contain '${needle}'`,);
  } else {
    fail(`${label ? `${label}: ` : ""}unexpectedly contains '${needle}'`,);
  }
}

export function assertFileExists(path: string, label?: string,): void {
  if (existsSync(path,)) {
    pass(`${label ? `${label}: ` : ""}file exists: ${basename(path,)}`,);
  } else {
    fail(`${label ? `${label}: ` : ""}file missing: ${path}`,);
  }
}

export function assertDirExists(path: string, label?: string,): void {
  if (existsSync(path,)) {
    pass(`${label ? `${label}: ` : ""}dir exists: ${basename(path,)}`,);
  } else {
    fail(`${label ? `${label}: ` : ""}dir missing: ${path}`,);
  }
}

export function printResults(): boolean {
  const total = PASS + FAIL;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,);
  console.log(`${success(`${PASS}`,)} passed, ${error(`${FAIL}`,)} failed, ${total} total`,);
  if (FAIL > 0) {
    console.log(`${error("SOME TESTS FAILED",)}`,);
    return false;
  }
  console.log(`${success("ALL TESTS PASSED",)}`,);
  return true;
}
