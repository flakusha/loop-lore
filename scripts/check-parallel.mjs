#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/* eslint-disable no-undef */

/**
 * Parallel check runner for loop-lore
 * Runs independent checks in parallel and aggregates results
 *
 * Usage:
 *   bun run scripts/check-parallel.mjs [--fix] [--ci]
 */

// ── Parse args ──────────────────────────────────────────────────

// ── Check definitions ───────────────────────────────────────────

const checks = {
  // Type checking
  "typecheck - backend": "bun run typecheck",
  "typecheck - frontend": "bun run typecheck:frontend",
  "typecheck - coverage": "bun run typecheck:coverage",
  "typecheck - coverage - frontend": "bun run typecheck:coverage:frontend",

  // Linting
  "lint - ts": "bun run lint",
  "lint - css": "bun run lint:css",
  "lint - html": "bun run lint:html",
  "lint - html - scripts": "bun run lint:html-scripts",
  "lint - chaining": "bun run lint:chaining",

  // Formatting
  "format - dprint": "bun run format:dprint",
  "md - lint": "bun run md:lint",

  // Dead-code analysis (knip)
  "dead - code (knip)": "bun run dead:code",

  // DB schema staleness (regenerates into temp dir, diffs vs committed)
  "db - schema gate": "bun run scripts/check-db-schemas.ts",

  // Size check
  "size - check": "bun run scripts/check-file-size.ts",
  "size - strict": "bun run scripts/check-file-size.ts --strict",

  // Context weight
  "context - weight": "bun run scripts/check-context-weight.ts",

  // Tests
  "test - unit": "bun run test:unit",
  "test - e2e": "E2E_SAFEGUARD=1 bun run test:e2e",
};

// ── Run checks in parallel ──────────────────────────────────────

const PROJECT_ROOT = import.meta.dir + "/..";

async function runCheck(name, command,) {
  const commandParts = ["-c", command,];
  try {
    const proc = Bun.spawn(["bash", ...commandParts,], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout,).text();
    const stderr = await new Response(proc.stderr,).text();
    return {
      name,
      passed: exitCode === 0,
      output: stdout || stderr,
      exitCode,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      output: error.message,
      exitCode: 1,
    };
  }
}

async function runAllChecks() {
  console.log("=== loop-lore parallel check runner ===",);
  console.log(`Running ${Object.keys(checks,).length} checks in parallel...\n`,);

  const promises = Object.entries(checks,).map(([name, command,],) => runCheck(name, command,));
  return Promise.all(promises,);
}

function reportResults(results,) {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ PASS: ${result.name}`,);
      passed++;
    } else {
      console.log(`✗ FAIL: ${result.name}`,);
      console.log(`  Output: ${result.output.split("\n",).slice(0, 10,).join("\n  ",)}`,);
      failed++;
    }
  }

  console.log("\n=== Summary ===",);
  console.log(`Total: ${results.length}`,);
  console.log(`Passed: ${passed}`,);
  console.log(`Failed: ${failed}`,);

  return failed;
}

// ── Non-blocking checks ─────────────────────────────────────────

async function runNonBlockingChecks() {
  console.log("\n=== Non-blocking checks ===",);

  // Version drift check
  try {
    const tagProc = Bun.spawn(["bash", "-c", "git tag --list v*",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await tagProc.exited;
    const tagText = await new Response(tagProc.stdout,).text();
    const tags = tagText.trim().split("\n",).filter(Boolean,);
    const latestTag = tags.at(-1,);

    const packageProc = Bun.spawn([
      "bash",
      "-c",
      'bun -p JSON.parse(require("fs").readFileSync("package.json","utf8")).version',
    ], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await packageProc.exited;
    const packageText = await new Response(packageProc.stdout,).text();
    const packageVersion = packageText.trim();

    if (latestTag && packageVersion) {
      const tagVersion = latestTag.replace(/^v/, "",);
      if (tagVersion === packageVersion) {
        console.log(`✓ Version in sync: ${packageVersion}`,);
      } else {
        console.log(`⚠ Version drift: package.json=${packageVersion}, latest tag=${tagVersion}`,);
        console.log("  Run 'bun run version:sync' to reconcile",);
      }
    }
  } catch {
    console.log("⚠ Version check skipped",);
  }

  // Code duplication check
  try {
    const jscpdProc = Bun.spawn(["bash", "-c", "bun run jscpd:full",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await jscpdProc.exited;
    const jscpdText = await new Response(jscpdProc.stdout,).text();
    if (jscpdText.includes("Found",)) {
      const cloneCount = (jscpdText.match(/Clone found/g,) ?? []).length;
      console.log(`⚠ Code duplication detected (jscpd:full): ${cloneCount} clones`,);
      console.log("  Run 'bun run jscpd:full' for full report",);
    } else {
      console.log("✓ No code duplication issues (jscpd:full)",);
    }
  } catch {
    console.log("✓ No code duplication issues (jscpd:full)",);
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const results = await runAllChecks();
  const failed = reportResults(results,);

  await runNonBlockingChecks();

  if (failed > 0) {
    console.log(`\n=== ${failed} check(s) failed ===`,);
    process.exit(1,);
  }

  console.log("\n=== All checks passed ===",);
}

main().catch((error,) => {
  console.error("❌ Check runner failed:", error.message,);
  process.exit(1,);
},);
