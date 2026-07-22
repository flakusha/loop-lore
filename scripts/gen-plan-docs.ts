#!/usr/bin/env bun
/**
 * Generate docs/meta/epics.md — consolidated epic index from .plan/epics/.
 *
 * Reads all .plan/epics/epic-*.md files, extracts status/priority/title from
 * frontmatter-like headers, and generates a VitePress-compatible markdown page
 * with per-epic sections and a summary table.
 *
 * Usage: bun run scripts/gen-plan-docs.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";

const ROOT = process.cwd();
const EPICS_DIR = join(ROOT, ".plan/epics",);
const BACKLOG = join(ROOT, ".plan/backlog.md",);
const OUT_EPICS = join(ROOT, "docs/meta/epics.md",);

interface Epic {
  file: string;
  title: string;
  status: string;
  priority: string;
  effort: string;
  type: string;
  tags: string[];
  overview: string;
  tasks: string[];
}

function parseEpic(filePath: string,): Epic | null {
  const raw = readFileSync(filePath, "utf8",);
  const filename = filePath.split("/",).pop() ?? "";

  // Extract title from heading
  const titleMatch = raw.match(/^#\s+(?:EPIC:\s*)?(.+)$/m,);
  const title = titleMatch?.[1]?.trim() ?? filename.replace(/\.md$/, "",);

  // Extract metadata fields
  const statusMatch = raw.match(/\*\*Status:\*\*\s*(.+)/,);
  const priorityMatch = raw.match(/\*\*Priority:\*\*\s*(.+)/,);
  const effortMatch = raw.match(/\*\*Effort:\*\*\s*(.+)/,);
  const typeMatch = raw.match(/\*\*Type:\*\*\s*(.+)/,);
  const tagsMatch = raw.match(/\*\*Tags:\*\*\s*(.+)/,);

  // Extract overview (first paragraph after ## Overview)
  const overviewMatch = raw.match(/## Overview\s*\n\s*\n([\s\S]*?)(?=\n##)/,);
  const overview = overviewMatch?.[1]?.trim().split("\n",)[0] ?? "";

  // Count tasks
  const taskMatches = raw.match(/- \[ \]/g,) ?? [];

  return {
    file: filename,
    title,
    status: statusMatch?.[1]?.trim() ?? "Unknown",
    priority: priorityMatch?.[1]?.trim() ?? "Unknown",
    effort: effortMatch?.[1]?.trim() ?? "Unknown",
    type: typeMatch?.[1]?.trim() ?? "Feature",
    tags: tagsMatch?.[1]?.split(",",).map((t,) => t.trim()) ?? [],
    overview,
    tasks: taskMatches.map(() => ""),
  };
}

// Read all epic files
if (!existsSync(EPICS_DIR,)) {
  console.error(`Epics directory not found: ${EPICS_DIR}`,);
  process.exit(1,);
}

const files = readdirSync(EPICS_DIR,).filter(
  (f,) => f.startsWith("epic-",) && f.endsWith(".md",),
);

const epics: Epic[] = [];
for (const f of files) {
  const epic = parseEpic(join(EPICS_DIR, f,),);
  if (epic) {
    epics.push(epic,);
  }
}

// Sort by status (Draft first, then Not Started, then In Progress, then Complete)
const statusOrder: Record<string, number> = {
  "📝 Draft": 0,
  "⬜ Not Started": 1,
  "🟡 In Progress": 2,
  "✅ Complete": 3,
};
epics.sort((a, b,) => {
  const sa = statusOrder[a.status] ?? 99;
  const sb = statusOrder[b.status] ?? 99;
  if (sa !== sb) { return sa - sb; }
  return a.title.localeCompare(b.title,);
},);

// Build markdown
let md = "# Epics Index\n\n";
md += "> Auto-generated from `.plan/epics/`. Do not edit manually.\n";
md += "> Regenerate with `bun run docs:gen`.\n\n";
md += `**Total:** ${epics.length} epics\n\n`;

// Summary table
md += "## Summary\n\n";
md += "| Status | Title | Priority | Effort | Tasks | File |\n";
md += "| ------ | ----- | -------- | ------ | ----- | ---- |\n";
for (const e of epics) {
  const taskCount = e.tasks.length;
  md +=
    `| ${e.status} | ${e.title} | ${e.priority} | ${e.effort} | ${taskCount} | [${e.file}](/.plan/epics/${e.file}) |\n`;
}

md += "\n---\n\n";

// Per-epic sections
md += "## Epics\n\n";
for (const e of epics) {
  md += `### ${e.title}\n\n`;
  md += `- **Status:** ${e.status}\n`;
  md += `- **Priority:** ${e.priority}\n`;
  md += `- **Effort:** ${e.effort}\n`;
  md += `- **Type:** ${e.type}\n`;
  if (e.tags.length > 0) {
    md += `- **Tags:** ${e.tags.join(", ",)}\n`;
  }
  md += `- **File:** \`.plan/epics/${e.file}\`\n`;
  if (e.overview) {
    md += `\n${e.overview}\n`;
  }
  md += "\n";
}

// Backlog reference
if (existsSync(BACKLOG,)) {
  md += "---\n\n";
  md += "## Backlog\n\n";
  md += "Full backlog with prioritized tasks: [.plan/backlog.md](/.plan/backlog.md)\n\n";
}

writeFileSync(OUT_EPICS, md,);
console.log(`Wrote ${OUT_EPICS} (${epics.length} epics)`,);
