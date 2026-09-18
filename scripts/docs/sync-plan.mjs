#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plan sync: mirror all .plan markdown into docs/plan-gen/ for the site.
 *
 * - Wipes docs/plan-gen/, then copies every .plan markdown file verbatim,
 *   preserving relative structure (in-plan relative links keep resolving).
 * - Non-markdown files (index.json, code-map.json, ...) are skipped.
 * - Generates index pages (docs/plan-gen/index.md plus one per top-level
 *   directory) with relative links so the site's '/docs/' base works.
 * - No content transformation: mermaid fences and front matter stay as-is.
 *
 * Usage:
 *   bun run scripts/docs/sync-plan.mjs
 */

import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const PLAN_DIR = path.join(REPO_ROOT, ".plan");
const OUT_DIR = path.join(REPO_ROOT, "docs", "plan-gen");

const DIR_TITLES = { epics: "Epics", tickets: "Tickets", backlog: "Backlog" };

// ── Collect .plan markdown files ────────────────────────────────

async function collectMdFiles(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const nested of await collectMdFiles(path.join(dir, entry.name), rel)) {
        files.push(nested);
      }
    } else if (entry.name.endsWith(".md")) {
      files.push(rel);
    }
  }
  return files.sort();
}

// ── Index page generation ───────────────────────────────────────

function bullet(text, href) {
  return `- [${text}](${href})`;
}

async function writeRootIndex(mdFiles, subdirs) {
  const lines = ["# Plan Index", ""];
  const topLevel = mdFiles.filter((rel) => !rel.includes("/"));
  if (topLevel.length > 0) {
    for (const rel of topLevel) {
      lines.push(bullet(rel.replace(/\.md$/, ""), `./${rel}`));
    }
    lines.push("");
  }
  if (subdirs.length > 0) {
    for (const dir of subdirs) {
      lines.push(bullet(DIR_TITLES[dir] ?? dir, `./${dir}/index.md`));
    }
    lines.push("");
  }
  await writeFile(path.join(OUT_DIR, "index.md"), lines.join("\n"));
}

async function writeDirIndex(dir, mdFiles) {
  const title = DIR_TITLES[dir] ?? dir;
  const lines = [`# ${title}`, ""];
  for (const rel of mdFiles) {
    const name = rel.slice(dir.length + 1).replace(/\.md$/, "");
    lines.push(bullet(name, `./${rel.slice(dir.length + 1)}`));
  }
  lines.push("");
  await writeFile(path.join(OUT_DIR, dir, "index.md"), lines.join("\n"));
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const mdFiles = await collectMdFiles(PLAN_DIR);
  for (const rel of mdFiles) {
    const dest = path.join(OUT_DIR, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(PLAN_DIR, rel), dest);
  }

  const subdirs = [];
  for (const entry of await readdir(PLAN_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const children = mdFiles.filter((rel) => rel.startsWith(`${entry.name}/`));
    if (children.length > 0) {
      subdirs.push(entry.name);
      await writeDirIndex(entry.name, children);
    }
  }
  subdirs.sort();

  await writeRootIndex(mdFiles, subdirs);

  console.log(`=== Plan sync complete ===`);
  console.log(`Copied ${mdFiles.length} markdown files to docs/plan-gen/`);
  console.log(`Wrote ${subdirs.length + 1} index pages`);
}

await main();
