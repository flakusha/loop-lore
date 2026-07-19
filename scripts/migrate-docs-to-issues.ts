#!/usr/bin/env bun
/**
 * Migrate loop-lore task docs to git-native-issue.
 *
 * Curated from docs/meta/{plan,backlog,open-items,roadmap}.md and epic-14-plan.md.
 * Each issue title embeds an extended identifier (BUG-/FEA-/FIX-/IDEA-/TASK-/EPIC-/INFRA-)
 * so the Vitepress docs site can auto-link them.
 *
 * Idempotent: skips extids already recorded in .plan/tickets/index.json, and
 * detects already-created issues via `git issue search` before creating.
 *
 * Usage: bun run scripts/migrate-docs-to-issues.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";

const ROOT = process.cwd();
const INDEX = join(ROOT, ".plan/tickets/index.json",);

type Priority = "low" | "medium" | "high" | "critical";
type Item = {
  /** Existing git-issue hash — edit title only, do not create. */
  hash?: string;
  extid: string;
  title: string;
  body: string;
  label: string;
  priority: Priority;
  /** Parent epic extid, linked via commit trailer semantics in body. */
  epic?: string;
  source: string;
};

// ── Existing issues (rename title to embed extid; deduped from open-items) ──
const existing: Item[] = [
  {
    hash: "17949fd",
    extid: "BUG-2025-002",
    title: "Browser E2E parallel suite instability",
    body: "7 Playwright browsers + 7 Bun.serve instances under parallel load trigger timeouts; " +
      "shared cachedSoloUser singleton corrupts state.\nSource: docs/meta/open-items.md (BUG.2)",
    label: "bug",
    priority: "medium",
    source: "docs/meta/open-items.md#bug2",
  },
  {
    hash: "8ec0ae7",
    extid: "FIX-2025-003",
    title: "Fire-and-forget DB writes mask failures",
    body: "4 `void updateAttemptStatus(...).catch()` on DB writes in src/generation/cancellation-actions.ts. " +
      "Failure leaves in-memory state out of sync with DB. Fix: log failures, await critical writes.\n" +
      "Source: docs/meta/open-items.md (CAST.2)",
    label: "fix",
    priority: "high",
    source: "docs/meta/open-items.md#cast2",
  },
  {
    hash: "8e5ee40",
    extid: "INFRA-2025-001",
    title: "Native git issue tracking integration",
    body: "Integrate git-native-issue for in-repository planning. Issues live in refs/issues/<uuid>.\n" +
      "Source: AGENTS.md, .plan/README.md",
    label: "infrastructure",
    priority: "high",
    source: "AGENTS.md",
  },
];

// ── Unresolved technical debt (open-items.md) ──
const debt: Item[] = [
  {
    extid: "BUG-2025-003",
    title: "Browser E2E cascade failure pattern",
    body: "Any timeout/failure corrupts shared ctx.page, killing all subsequent tests. " +
      "Fix: each test operates on fresh starting state.\nSource: docs/meta/open-items.md (BUG.3)",
    label: "bug",
    priority: "medium",
    source: "docs/meta/open-items.md#bug3",
  },
  {
    extid: "TASK-2025-001",
    title: "TUI chat has no retry/idempotency key",
    body: "src/tui/chat.ts sends messages without retry on failure. Add retry logic + idempotency key handling.\n" +
      "Source: docs/meta/open-items.md (TUI.2)",
    label: "tui",
    priority: "low",
    source: "docs/meta/open-items.md#tui2",
  },
  {
    extid: "TASK-2025-002",
    title: "TUI left/right key conflict",
    body: "src/tui/asset-view.ts:67-71 registers left/right on screen.key, conflicting with input navigation. " +
      "Scope to active widget context.\nSource: docs/meta/open-items.md (TUI.3)",
    label: "tui",
    priority: "low",
    source: "docs/meta/open-items.md#tui3",
  },
  {
    extid: "TASK-2025-003",
    title: "View template source/artifact divergence",
    body: "src/routes/views.ts serves views dynamically with on-the-fly minification; build-time minified copies " +
      "in dist/public/ are unused. Consider caching minified templates.\nSource: docs/meta/open-items.md (HTTP.2)",
    label: "debt",
    priority: "low",
    source: "docs/meta/open-items.md#http2",
  },
  {
    extid: "TASK-2025-004",
    title: "E2E: no cancel-during-generation test",
    body: "Cancel endpoint tested but no mid-stream cancellation test. Need: start generation, send cancel while " +
      "streaming, verify inactive status.\nSource: docs/meta/open-items.md (TEST.3)",
    label: "testing",
    priority: "medium",
    source: "docs/meta/open-items.md#test3",
  },
  {
    extid: "TASK-2025-005",
    title: "E2E: no generation idempotency test",
    body: "Idempotency keys used in tests (12 occurrences) but no duplicate-key test. Need: send same key twice, " +
      "assert identical response.\nSource: docs/meta/open-items.md (TEST.4)",
    label: "testing",
    priority: "medium",
    source: "docs/meta/open-items.md#test4",
  },
  {
    extid: "TASK-2025-006",
    title: "E2E: test ordering fragile (shared mutable state)",
    body: "Only generation.test.ts uses beforeEach. Others lack isolation. Fix: add beforeEach for fresh test data.\n" +
      "Source: docs/meta/open-items.md (TEST.5)",
    label: "testing",
    priority: "medium",
    source: "docs/meta/open-items.md#test5",
  },
  {
    extid: "TASK-2025-007",
    title: "E2E: browser auth flow incomplete",
    body: "auth-flow.browser.ts missing successful login, demo login execution, logout, auth-dependent UI.\n" +
      "Source: docs/meta/open-items.md (TEST.6)",
    label: "testing",
    priority: "medium",
    source: "docs/meta/open-items.md#test6",
  },
  {
    extid: "TASK-2025-008",
    title: "E2E: browser chat flow sends no messages",
    body: "chat-flow.browser.ts only tests panel toggles. Missing message typing, sending, receiving.\n" +
      "Source: docs/meta/open-items.md (TEST.7)",
    label: "testing",
    priority: "medium",
    source: "docs/meta/open-items.md#test7",
  },
  {
    extid: "TASK-2025-009",
    title: "Unit: 17 quick-win source files untested",
    body: "Route unit tests exist (28 files) but many are stubs. Expand coverage for ~1,400 lines of pure logic.\n" +
      "Source: docs/meta/open-items.md (TEST.8)",
    label: "testing",
    priority: "medium",
    source: "docs/meta/open-items.md#test8",
  },
  {
    extid: "TASK-2025-010",
    title: "Unit: story module nearly untested",
    body: "src/story/ has game-master.test.ts (22 tests) but quest-engine, quality-evaluator, turn-manager, " +
      "world-state, events/* lack coverage.\nSource: docs/meta/open-items.md (TEST.9)",
    label: "testing",
    priority: "medium",
    source: "docs/meta/open-items.md#test9",
  },
  {
    extid: "TASK-2025-011",
    title: "Unit: route handler isolation missing",
    body: "Route unit tests lack handler isolation. Consider mocking DB layer for pure handler tests.\n" +
      "Source: docs/meta/open-items.md (TEST.11)",
    label: "testing",
    priority: "low",
    source: "docs/meta/open-items.md#test11",
  },
  {
    extid: "TASK-2025-012",
    title: "E2E: RPG mechanics no tests",
    body: "No rpg.test.ts in e2e. Dice, combat, equipment, XP, loot endpoints untested.\n" +
      "Source: docs/meta/open-items.md (TEST.12)",
    label: "testing",
    priority: "low",
    source: "docs/meta/open-items.md#test12",
  },
  {
    extid: "TASK-2025-013",
    title: "Nested ternary expressions from dprint reformatting",
    body: "3 files (logger.ts:71, prompt-templates.ts:546, response-headers.ts:208) have unicorn/no-nested-ternary " +
      "errors. Fix: parenthesize nested ternaries.\nSource: docs/meta/open-items.md (LINT.4)",
    label: "lint",
    priority: "low",
    source: "docs/meta/open-items.md#lint4",
  },
  {
    extid: "TASK-2025-014",
    title: "Backend lint errors from new notification files",
    body: "src/notifications/service.ts: 2 errors (unicorn/prefer-export-from, consistent-type-definitions). " +
      "Fix: re-export properly, use interface.\nSource: docs/meta/open-items.md (LINT.3)",
    label: "lint",
    priority: "low",
    source: "docs/meta/open-items.md#lint3",
  },
  {
    extid: "IDEA-2025-001",
    title: "Evaluate Biome as complementary linter/formatter",
    body: "Biome (Rust) could replace Prettier (~25x faster) and cover ~60-70% of non-type-aware ESLint rules. " +
      "Type-aware rules stay on ESLint. Deferred.\nSource: docs/meta/open-items.md (TOOL.1)",
    label: "idea",
    priority: "low",
    source: "docs/meta/open-items.md#tool1",
  },
];

// ── Epic containers (active / not-yet-complete initiatives) ──
const epics: Item[] = [
  {
    extid: "EPIC-2025-11",
    title: "Admin & Settings",
    body: "Admin UI, per-user prefs, plugin management. Blocks multi-user deployment.\n" +
      "Source: docs/meta/backlog.md (Epic 11)",
    label: "epic",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "EPIC-2025-14",
    title: "Import/Export & Data Portability",
    body: "Character card multi-format import (CCv2/CCv3/CHARX/PNG), chat export, bulk export.\n" +
      "Source: docs/meta/epic-14-plan.md, docs/meta/backlog.md (Epic 14)",
    label: "epic",
    priority: "medium",
    source: "docs/meta/epic-14-plan.md",
  },
  {
    extid: "EPIC-2025-15",
    title: "i18n & Accessibility",
    body: "Server-side i18n module, ARIA pass, keyboard nav, 10 locales.\n" +
      "Source: docs/meta/backlog.md (Epic 15)",
    label: "epic",
    priority: "high",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "EPIC-2025-16",
    title: "Observability",
    body: "Telemetry, admin analytics, CI config, Playwright responsive tests. In progress (P0).\n" +
      "Source: docs/meta/backlog.md (Epic 16)",
    label: "epic",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "EPIC-2025-17",
    title: "Encryption Foundation",
    body: "At-rest AES-256-GCM, per-user keys, browser-side key derivation.\n" +
      "Source: docs/meta/backlog.md (Epic 17)",
    label: "epic",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "EPIC-2025-21",
    title: "Notification Expansion",
    body: "Noise presets, per-event thresholds.\nSource: docs/meta/roadmap.md (Epic 21)",
    label: "epic",
    priority: "medium",
    source: "docs/meta/roadmap.md",
  },
  {
    extid: "EPIC-2025-22",
    title: "RPG Mechanics Core",
    body: "Dice, stats, combat, equipment, XP, loot.\nSource: docs/meta/roadmap.md (Epic 22)",
    label: "epic",
    priority: "medium",
    source: "docs/meta/roadmap.md",
  },
  {
    extid: "EPIC-2025-23",
    title: "Assistant Commands",
    body: "/improve, /image, /quest, autocomplete. Command parser partially built.\n" +
      "Source: docs/meta/roadmap.md (Epic 23)",
    label: "epic",
    priority: "low",
    source: "docs/meta/roadmap.md",
  },
  {
    extid: "EPIC-2025-24",
    title: "Filtering & Pagination",
    body: "Combined filters, cursor pagination. Lists unusable past ~50 items.\n" +
      "Source: docs/meta/roadmap.md (Epic 24)",
    label: "epic",
    priority: "low",
    source: "docs/meta/roadmap.md",
  },
];

// ── Feature requests (backlog P2 / roadmap) ──
const features: Item[] = [
  {
    extid: "FEAT-2025-001",
    title: "Multi-format character import (PNG/YAML/TOML/CHARX)",
    body: "Only JSON import works today. Add CCv2/CCv3/Character.AI/PNG/CHARX normalizers.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "low",
    epic: "EPIC-2025-14",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-002",
    title: "Impersonation (chat.impersonate_id)",
    body: "docs/spec/character-setup.md specifies impersonation; not implemented.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-003",
    title: "Three-tier memory system (episodic/semantic/procedural)",
    body: "docs/spec/memory-system.md specifies; only actor_memories table exists.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "high",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-004",
    title: "Artifact system (code/docs/datasets as assets)",
    body: "docs/spec/artifacts-system.md specifies; not implemented.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-005",
    title: "Agentic workspace mode",
    body: "docs/spec/use-case-agentic-workspace.md specifies; not implemented.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-006",
    title: "Frontend story mode UI (GM panel, quest log, story chat)",
    body: "Backend src/story/ exists; no frontend. docs/frontend/chat/multi-llm-story.md.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "high",
    epic: "EPIC-2025-22",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-007",
    title: "Message archiving (cascade, restore, purge)",
    body: "docs/frontend/chat/archiving.md, docs/spec/archival-workflow.md. Hard delete only today.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-008",
    title: "Memory selection UI (mid-chat panel, pinning, auto-extract)",
    body: "Backend reads memories; no UI. docs/frontend/chat/memories.md.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-009",
    title: "Server-side i18n middleware (req.t)",
    body: "docs/frontend/internationalization.md. Minimal client-side __() only.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "medium",
    epic: "EPIC-2025-15",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-010",
    title: "Anthropic/Ollama/Bedrock providers",
    body: "docs/spec/provider-system.md. Only OpenAI-compatible exists.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-011",
    title: "Plugin management API (install/list/enable/disable)",
    body: "docs/spec/plugin-system.md. Plugin skeleton loads files; no API.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "medium",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-012",
    title: "Signed URLs for asset downloads",
    body: "docs/spec/assets.md. Uses raw endpoint with Bearer auth today.\n" +
      "Source: docs/meta/backlog.md (P2)",
    label: "feature",
    priority: "low",
    source: "docs/meta/backlog.md",
  },
  {
    extid: "FEAT-2025-013",
    title: "Regex output transforms (render-time agent/tool output parsing)",
    body: "Quick win Q1. Source: docs/meta/roadmap.md (feature-analysis #6)",
    label: "feature",
    priority: "low",
    source: "docs/meta/roadmap.md",
  },
  {
    extid: "FEAT-2025-014",
    title: "Smart-regen transforms (one-click draft polish)",
    body: "Quick win Q2. Source: docs/meta/roadmap.md (feature-analysis #8)",
    label: "feature",
    priority: "low",
    source: "docs/meta/roadmap.md",
  },
];

const items: Item[] = [...existing, ...debt, ...epics, ...features,];

function run(args: string[],): { code: number; out: string } {
  const r = Bun.spawnSync(["git", ...args,], { cwd: ROOT, },);
  return {
    code: r.exitCode ?? 1,
    out: (r.stdout.toString() + r.stderr.toString()).trim(),
  };
}

type IndexRec = {
  hash?: string;
  extid: string;
  type: string;
  title: string;
  label: string;
  priority: string;
  epic?: string;
  source: string;
  body: string;
};

const index: Record<string, IndexRec> = existsSync(INDEX,)
  ? (() => {
    try {
      return JSON.parse(readFileSync(INDEX, "utf8",),);
    } catch {
      return {} as Record<string, IndexRec>;
    }
  })()
  : {};

const created: string[] = [];
const renamed: string[] = [];
const skipped: string[] = [];

for (const it of items) {
  const fullTitle = `${it.extid}: ${it.title}`;

  // Already recorded with a hash → skip.
  if (index[it.extid]?.hash) {
    skipped.push(it.extid,);
    continue;
  }

  if (it.hash) {
    // Existing issue: rename title to embed extid.
    const r = run(["issue", "edit", it.hash, "-t", fullTitle,],);
    if (r.code !== 0) {
      console.error(`✗ edit ${it.extid} (${it.hash}): ${r.out}`,);
      continue;
    }
    index[it.extid] = {
      hash: it.hash,
      extid: it.extid,
      type: it.extid.split("-",)[0],
      title: fullTitle,
      label: it.label,
      priority: it.priority,
      epic: it.epic,
      source: it.source,
      body: it.body,
    };
    renamed.push(`${it.extid} (${it.hash})`,);
    continue;
  }

  // Guard against double-create: search by extid prefix.
  const search = run(["issue", "search", `${it.extid}:`,],);
  if (search.out.includes(it.extid,)) {
    const ls = run(["issue", "ls", "-a", "--format", "oneline",],);
    const line = ls.out.split("\n",).find((l,) => l.includes(`${it.extid}:`,));
    const hash = line?.split(" ",)[0] ?? "";
    index[it.extid] = {
      hash,
      extid: it.extid,
      type: it.extid.split("-",)[0],
      title: fullTitle,
      label: it.label,
      priority: it.priority,
      epic: it.epic,
      source: it.source,
      body: it.body,
    };
    skipped.push(it.extid,);
    continue;
  }

  const r = run([
    "issue",
    "create",
    fullTitle,
    "-m",
    it.body,
    "-l",
    it.label,
    "-p",
    it.priority,
  ],);
  if (r.code !== 0) {
    console.error(`✗ create ${it.extid}: ${r.out}`,);
    continue;
  }
  const m = r.out.match(/Created issue ([0-9a-f]+)/,);
  const hash = m?.[1] ?? "";
  index[it.extid] = {
    hash,
    extid: it.extid,
    type: it.extid.split("-",)[0],
    title: fullTitle,
    label: it.label,
    priority: it.priority,
    epic: it.epic,
    source: it.source,
    body: it.body,
  };
  created.push(`${it.extid} → ${hash}`,);
}

mkdirSync(join(ROOT, ".plan/tickets",), { recursive: true, },);
writeFileSync(INDEX, JSON.stringify(index, null, 2,) + "\n",);

console.log(`\n=== Migration summary ===`,);
console.log(`Created: ${created.length}`,);
created.forEach((c,) => console.log(`  + ${c}`,));
console.log(`Renamed: ${renamed.length}`,);
renamed.forEach((c,) => console.log(`  ~ ${c}`,));
console.log(`Skipped (already present): ${skipped.length}`,);
skipped.forEach((c,) => console.log(`  = ${c}`,));
console.log(`\nIndex written → ${INDEX}`,);
