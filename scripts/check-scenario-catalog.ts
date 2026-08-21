#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Verify tests/e2e/scenario-catalog.json invariants.
// Exits 0 on all-pass; exits 1 on any failure.

import { existsSync, readFileSync, } from "node:fs";
import { join, } from "node:path";

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, "tests/e2e/scenario-catalog.json",);

const CANONICAL_PILLARS = new Set([
  "register",
  "auth-session",
  "chat-send",
  "chat-state",
  "assistant-tool-call-ui",
  "gm-panels-quest-log",
  "gallery-batch",
  "world-location-access",
  "invite-join",
  "api-keys",
  "search",
  "settings",
  "navigation",
  "characters",
  "generation",
],);

interface ScenarioEntry {
  id: string;
  tests: string[];
}
interface PillarEntry {
  id: string;
  scenarios: ScenarioEntry[];
}
interface Catalog {
  meta: { schemaVersion: number; generatedAt: string; pillarCount: number; scenarioCount: number; testCount: number };
  pillars: PillarEntry[];
}

function main(): void {
  const errors: string[] = [];

  // 1. File exists
  if (!existsSync(CATALOG_PATH,)) {
    errors.push("catalog file not found at " + CATALOG_PATH,);
    report(errors,);
    process.exit(1,);
  }

  // 2. Parses as JSON
  let catalog: Catalog;
  try {
    const raw = readFileSync(CATALOG_PATH, "utf8",);
    catalog = JSON.parse(raw,) as Catalog;
  } catch (e) {
    errors.push("failed to parse JSON: " + (e as Error).message,);
    report(errors,);
    process.exit(1,);
  }

  // 3. schemaVersion === 1
  if (catalog.meta.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1, got " + catalog.meta.schemaVersion,);
  }

  // 4. All pillar ids in canonical set
  const unknownPillars = catalog.pillars
    .map(p => p.id)
    .filter(id => !CANONICAL_PILLARS.has(id,));
  if (unknownPillars.length > 0) {
    errors.push("unknown pillar ids: " + unknownPillars.join(", ",),);
  }

  // 5. Every pillar has >= 1 scenario with >= 1 test
  for (const pillar of catalog.pillars) {
    if (pillar.scenarios.length === 0) {
      errors.push("pillar '" + pillar.id + "' has no scenarios",);
    } else {
      for (const scenario of pillar.scenarios) {
        if (scenario.tests.length === 0) {
          errors.push("pillar '" + pillar.id + "' scenario '" + scenario.id + "' has no tests",);
        }
      }
    }
  }

  // 6. Every referenced test path exists
  const testFiles = new Set<string>();
  for (const pillar of catalog.pillars) {
    for (const scenario of pillar.scenarios) {
      for (const testPath of scenario.tests) {
        testFiles.add(testPath,);
      }
    }
  }
  for (const testPath of testFiles) {
    if (!existsSync(join(ROOT, testPath,),)) {
      errors.push("referenced test does not exist: " + testPath,);
    }
  }

  // 7. Meta counts match actual
  const actualPillarCount = catalog.pillars.length;
  const actualScenarioCount = catalog.pillars.reduce((n, p,) => n + p.scenarios.length, 0,);
  const actualTestCount = catalog.pillars.reduce(
    (n, p,) => n + p.scenarios.reduce((m, s,) => m + s.tests.length, 0,),
    0,
  );
  if (catalog.meta.pillarCount !== actualPillarCount) {
    errors.push("meta.pillarCount is " + catalog.meta.pillarCount + " but actual is " + actualPillarCount,);
  }
  if (catalog.meta.scenarioCount !== actualScenarioCount) {
    errors.push("meta.scenarioCount is " + catalog.meta.scenarioCount + " but actual is " + actualScenarioCount,);
  }
  if (catalog.meta.testCount !== actualTestCount) {
    errors.push("meta.testCount is " + catalog.meta.testCount + " but actual is " + actualTestCount,);
  }

  // Print results
  console.log("Scenario catalog check",);
  console.log("=".repeat(40,),);
  console.log("  catalog: " + CATALOG_PATH,);
  console.log("  schema:  v" + catalog.meta.schemaVersion,);
  console.log("  pillars: " + actualPillarCount + " (canonical " + CANONICAL_PILLARS.size + ")",);
  console.log("  scenarios: " + actualScenarioCount,);
  console.log("  tests: " + actualTestCount,);

  // Show per-pillar status
  console.log("",);
  for (const pillar of catalog.pillars.sort((a, b,) => a.id.localeCompare(b.id,))) {
    const totalTests = pillar.scenarios.reduce((n, s,) => n + s.tests.length, 0,);
    const status = totalTests > 0 ? "OK" : "EMPTY";
    const flag = CANONICAL_PILLARS.has(pillar.id,) ? "" : " [UNKNOWN]";
    console.log(
      "  [" + status + "] " + pillar.id + " (" + pillar.scenarios.length + " scenarios, " + totalTests + " tests)" +
        flag,
    );
  }

  report(errors,);
}

function report(errors: string[],): void {
  console.log("",);
  if (errors.length === 0) {
    console.log("All checks passed.",);
  } else {
    console.log("FAILURES:",);
    for (const e of errors) {
      console.log("  - " + e,);
    }
  }
  process.exit(errors.length > 0 ? 1 : 0,);
}

main();
