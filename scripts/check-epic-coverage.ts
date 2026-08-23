#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Epic coverage check (advisory).
 *
 * Detects frontend epics whose status is "Not Started"/"Partial" but which
 * already have implemented code in src/ and/or no referencing ticket — i.e.
 * "non-signified" work where the planning index has drifted from the code.
 *
 * This is advisory planning hygiene, not a code-correctness gate. It exits 0.
 *
 * Run: `bun run scripts/check-epic-coverage.ts`
 */

import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..",);
const SRC = path.join(ROOT, "src",);
const TICKETS = path.join(ROOT, ".plan", "tickets",);
const EPICS = path.join(ROOT, ".plan", "epics",);

// epic slug -> { dirs: paths under src to check, kw: grep keywords in src }
const MAP: Record<string, { dirs: string[]; kw: string[] }> = {
  "epic-frontend-age-gate": { dirs: ["age-gate", "frontend/alpine/age-gate",], kw: ["ageGate", "age-gate",], },
  "epic-frontend-login": { dirs: ["views/login.html", "views/register.html",], kw: ["login", "register",], },
  "epic-frontend-notifications": { dirs: ["frontend/alpine/user-notifications.ts",], kw: ["notificationsBell",], },
  "epic-frontend-routing": { dirs: ["server", "routes",], kw: ["htmx",], },
  "epic-frontend-internationalization": { dirs: ["frontend/alpine/i18n.ts",], kw: ["i18n",], },
  "epic-frontend-settings": { dirs: ["frontend/alpine/settings",], kw: ["settings",], },
  "epic-frontend-admin": { dirs: ["frontend/alpine/admin.ts",], kw: ["admin",], },
  "epic-frontend-gallery": { dirs: ["frontend/pages/gallery.ts",], kw: ["gallery",], },
  "epic-battle-ui": { dirs: ["frontend/battle",], kw: ["battle",], },
  "epic-nsfw-ui": { dirs: ["nsfw", "frontend/alpine/nsfw",], kw: ["nsfw",], },
  "epic-rag-ui": { dirs: ["rag", "frontend/alpine/rag",], kw: ["rag",], },
  "epic-terminal-ui": { dirs: ["tui",], kw: ["terminal",], },
  "epic-inventory-ui": { dirs: ["rpg/inventory", "frontend/alpine/inventory",], kw: ["inventory",], },
  "epic-plugin-management-ui": { dirs: ["plugins", "frontend/alpine/plugin",], kw: ["plugin",], },
  "epic-embeddable-engine-game-frontend": { dirs: ["frontend/embeddable",], kw: ["embeddable",], },
  "epic-headless-alternative-frontends": { dirs: ["frontend/headless",], kw: ["headless",], },
  "epic-frontend-bundle-optimization": { dirs: ["build",], kw: ["bundle",], },
  "epic-frontend-component-architecture": { dirs: ["components",], kw: ["component",], },
  "epic-frontend-components": { dirs: ["components",], kw: ["component",], },
  "epic-frontend-headers-management": { dirs: ["components/header.html",], kw: ["header",], },
  "epic-frontend-backend-integration": { dirs: ["frontend/fe-fetch.ts",], kw: ["feFetch",], },
  "epic-frontend-encryption": { dirs: ["frontend/alpine/key-management.ts", "crypto",], kw: ["keyManagement",], },
  "epic-story-mode-ui": { dirs: ["frontend/alpine/story-state", "story",], kw: ["story",], },
};

function walk(dir: string,): string[] {
  const out: string[] = [];
  if (!existsSync(dir,)) { return out; }
  for (const e of readdirSync(dir,)) {
    const p = path.join(dir, e,);
    const s = statSync(p,);
    if (s.isDirectory()) { out.push(...walk(p,),); }
    else if (/\.(ts|html|css)$/.test(e,)) { out.push(p,); }
  }
  return out;
}
const allSrc = walk(SRC,);

function statusOf(epic: string,): string {
  const f = path.join(EPICS, `${epic}.md`,);
  if (!existsSync(f,)) { return "NO-EPIC-FILE"; }
  const txt = readFileSync(f, "utf8",);
  const m = txt.match(/^\*\*Status:\*\*\s*(.+)$/m,);
  return m ? m[1].trim() : "NO-STATUS";
}
function kwHits(kw: string[],): number {
  let n = 0;
  for (const f of allSrc) {
    const txt = readFileSync(f, "utf8",);
    if (kw.some((k,) => txt.includes(k,))) { n++; }
  }
  return n;
}
function ticketCount(epic: string,): number {
  if (!existsSync(TICKETS,)) { return 0; }
  let n = 0;
  for (const e of readdirSync(TICKETS,)) {
    if (!e.endsWith(".md",)) { continue; }
    if (readFileSync(path.join(TICKETS, e,), "utf8",).includes(epic,)) { n++; }
  }
  return n;
}

console.log("=== Epic coverage check (advisory) ===",);
const stale: string[] = [];
const gaps: string[] = [];
for (const [epic, cfg,] of Object.entries(MAP,)) {
  const status = statusOf(epic,);
  const dirsPresent = cfg.dirs.filter((d,) => existsSync(path.join(SRC, d,),)).length;
  const hits = kwHits(cfg.kw,);
  const tk = ticketCount(epic,);
  const notStarted = /not started|⬜|📝 draft/i.test(status,);
  if (notStarted && (dirsPresent > 0 || hits > 0) && tk === 0) {
    stale.push(`${epic}  status="${status}" dirs=${dirsPresent} kwFiles=${hits} tickets=${tk}`,);
  } else if (notStarted && dirsPresent === 0 && hits === 0 && tk === 0) {
    gaps.push(`${epic}  status="${status}" (genuine gap, no code, no ticket)`,);
  }
}
if (stale.length) {
  console.log(`\n⚠ STALE (Not Started but code exists, no ticket) — ${stale.length}:`,);
  for (const s of stale) { console.log(`  - ${s}`,); }
}
if (gaps.length) {
  console.log(`\n• GENUINE GAPS (no code, no ticket) — ${gaps.length}:`,);
  for (const g of gaps) { console.log(`  - ${g}`,); }
}
if (!stale.length && !gaps.length) { console.log("✓ No stale or un-signified frontend epics detected.",); }
console.log("\nAdvisory only — not blocking.",);
process.exit(0,);
