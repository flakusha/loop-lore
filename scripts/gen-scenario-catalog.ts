#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Generate tests/e2e/scenario-catalog.json -- canonical feature -> scenario -> test
// matrix referenced by epic-e2e-integration-testing Pillar 1, Step 3.
//
// Algorithm:
//  1. Walk tests/e2e/**/*.browser.ts
//  2. Extract @pillar <id> tags from top-of-file JSDoc block
//  3. Fall back to deterministic filename -> pillar heuristic
//  4. Aggregate and emit stable JSON with meta + sorted pillar/scenario keys

import { readdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import { join, relative, } from "node:path";

const ROOT = process.cwd();
const OUTPUT_PATH = join(ROOT, "tests/e2e/scenario-catalog.json",);

// Canonical pillar list from epic-e2e-integration-testing Pillar 1
const PILLARS: readonly string[] = [
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
];

// Filename -> pillar heuristic: first match wins
const FILENAME_TO_PILLAR: ReadonlyArray<[RegExp, string,]> = [
  [/^register/, "register",],
  [/^auth-session/, "auth-session",],
  [/^auth-flow/, "auth-session",],
  [/^chat-send/, "chat-send",],
  [/^chat-state/, "chat-state",],
  [/^chat-flow/, "chat-state",],
  [/^group-chat-matrix/, "chat-state",],
  [/^assistant-tool/, "assistant-tool-call-ui",],
  [/^quests/, "gm-panels-quest-log",],
  [/^notifications/, "gm-panels-quest-log",],
  [/^gallery/, "gallery-batch",],
  [/^worlds-flow/, "world-location-access",],
  [/^access-correctness/, "world-location-access",],
  [/^world-invites/, "invite-join",],
  [/^api-keys/, "api-keys",],
  [/^search/, "search",],
  [/^settings/, "settings",],
  [/^nsfw-moderation/, "settings",],
  [/^navigation/, "navigation",],
  [/^redirection/, "navigation",],
  [/^htmx-alpine/, "navigation",],
  [/^characters-flow/, "characters",],
  [/^personas/, "characters",],
  [/^creation-flow/, "characters",],
  [/^admin-dashboard/, "characters",],
  [/^smoke/, "navigation",],
  [/^image-edit/, "generation",],
  [/^generation/, "generation",],
];

interface ScenarioEntry {
  id: string;
  tests: string[];
}
interface PillarEntry {
  id: string;
  scenarios: ScenarioEntry[];
}
interface CatalogMeta {
  schemaVersion: 1;
  generatedAt: string;
  pillarCount: number;
  scenarioCount: number;
  testCount: number;
}
interface Catalog {
  meta: CatalogMeta;
  pillars: PillarEntry[];
}

function walkBrowserTests(): string[] {
  const out: string[] = [];
  const stack: string[] = [join(ROOT, "tests/e2e",),];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir,);
    } catch {
      continue;
    }
    for (const name of entries) {
      const p = join(dir, name,);
      let st;
      try {
        st = statSync(p,);
      } catch {
        continue;
      }
      if (st.isDirectory()) { stack.push(p,); }
      else if (st.isFile() && name.endsWith(".browser.ts",)) { out.push(p,); }
    }
  }
  return out.sort();
}

function extractPillarTags(content: string,): Set<string> {
  const out = new Set<string>();
  const head = content.split("\n",).slice(0, 80,).join("\n",);
  const re = /@pillar\s+([a-z0-9][a-z0-9-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head,)) !== null) { out.add(m[1]!,); }
  return out;
}

function heuristicPillars(stem: string,): string[] {
  for (const [re, pillar,] of FILENAME_TO_PILLAR) {
    if (re.test(stem,)) { return [pillar,]; }
  }
  return [];
}

function scenarioIdFromPath(absPath: string,): string {
  const base = absPath.split("/",).pop() ?? absPath;
  return base.replace(/\.browser\.ts$/u, "",);
}

function buildCatalog(): Catalog {
  const files = walkBrowserTests();
  const agg = new Map<string, Map<string, Set<string>>>();
  const orphans: string[] = [];

  for (const file of files) {
    const rel = relative(ROOT, file,);
    const stem = scenarioIdFromPath(file,);
    const content = readFileSync(file, "utf8",);
    let pillars = [...extractPillarTags(content,),];
    if (pillars.length === 0) { pillars = heuristicPillars(stem,); }
    if (pillars.length === 0) {
      orphans.push(rel,);
      continue;
    }
    for (const pillar of pillars) {
      if (!agg.has(pillar,)) { agg.set(pillar, new Map(),); }
      const scenarios = agg.get(pillar,)!;
      if (!scenarios.has(stem,)) { scenarios.set(stem, new Set(),); }
      scenarios.get(stem,)!.add(rel,);
    }
  }

  const pillarIds = new Set<string>(PILLARS,);
  const extras = [...agg.keys(),].filter(p => !pillarIds.has(p,));
  if (extras.length > 0) {
    console.error("Unknown pillars discovered: " + extras.join(", ",),);
    process.exit(2,);
  }

  if (orphans.length > 0) {
    console.error("Orphan browser tests (no pillar + no heuristic match):",);
    for (const o of orphans) { console.error("  " + o,); }
    process.exit(2,);
  }

  const pillars: PillarEntry[] = [...agg.keys(),].sort().map(pillarId => ({
    id: pillarId,
    scenarios: [...agg.get(pillarId,)!.keys(),].sort().map(sid => ({
      id: sid,
      tests: [...agg.get(pillarId,)!.get(sid,)!,].sort(),
    })),
  }));

  const scenarioCount = pillars.reduce((n, p,) => n + p.scenarios.length, 0,);
  const testCount = pillars.reduce((n, p,) => n + p.scenarios.reduce((m, s,) => m + s.tests.length, 0,), 0,);

  const meta: CatalogMeta = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    pillarCount: pillars.length,
    scenarioCount,
    testCount,
  };

  return { meta, pillars, };
}

function main(): void {
  const catalog = buildCatalog();
  const json = JSON.stringify(catalog, null, 2,) + "\n";
  writeFileSync(OUTPUT_PATH, json,);
  console.log(
    "Wrote " + relative(ROOT, OUTPUT_PATH,) +
      " (" + catalog.meta.pillarCount + " pillars, " +
      catalog.meta.scenarioCount + " scenarios, " +
      catalog.meta.testCount + " tests)",
  );
}

main();
