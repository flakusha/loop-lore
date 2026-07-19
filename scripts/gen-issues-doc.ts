#!/usr/bin/env bun
/**
 * Generate docs/meta/issues.md — an in-repo issue tracker view.
 *
 * Merges curated metadata from .plan/tickets/index.json (extid, source, body, epic)
 * with authoritative state from `git issue ls -a --format full` (open/closed, labels,
 * priority). Each issue gets a heading whose slug is the lowercased extid, so the
 * Vitepress issue-link plugin can deep-link directly to it.
 *
 * Usage: bun run scripts/gen-issues-doc.ts
 */
import { existsSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";

const ROOT = process.cwd();
const INDEX = join(ROOT, ".plan/tickets/index.json",);
const OUT = join(ROOT, "docs/meta/issues.md",);

type Rec = {
  hash: string;
  extid: string;
  type: string;
  title: string;
  label: string;
  priority: string;
  epic?: string;
  source: string;
  body: string;
};

const index: Record<string, Rec> = existsSync(INDEX,)
  ? JSON.parse(readFileSync(INDEX, "utf8",),)
  : {};

function git(args: string[],): string {
  const r = Bun.spawnSync(["git", ...args,], { cwd: ROOT, },);
  return (r.stdout.toString() + r.stderr.toString()).trim();
}

// Authoritative state from git.
const full = git(["issue", "ls", "-a", "--format", "full",],);
const lines = full.split("\n",);
const stateByHash: Record<string, { state: string; labels: string; priority: string }> = {};
let cur: string | null = null;
for (const l of lines) {
  const m = l.match(/^([0-9a-f]+)\s+\[(open|closed)\]\s+(.*)$/,);
  if (m) {
    cur = m[1];
    stateByHash[cur] = { state: m[2], labels: "", priority: "", };
    continue;
  }
  if (!cur) { continue; }
  const lt = l.trim();
  if (lt.startsWith("labels:",)) { stateByHash[cur].labels = lt.slice("labels:".length,).trim(); }
  if (lt.startsWith("priority:",)) { stateByHash[cur].priority = lt.slice("priority:".length,).trim(); }
}

const recs = Object.values(index,) as Rec[];
const order = ["EPIC", "INFRA", "FEAT", "BUG", "FIX", "TASK", "IDEA",];
recs.sort((a, b,) => {
  const oa = order.indexOf(a.type,);
  const ob = order.indexOf(b.type,);
  if (oa !== ob) { return oa - ob; }
  return a.extid.localeCompare(b.extid,);
},);

const groups: Record<string, Rec[]> = {};
for (const r of recs) { (groups[r.type] ??= []).push(r,); }

const open = recs.filter((r,) => stateByHash[r.hash]?.state === "open").length;
const closed = recs.length - open;

let md = "# Issue Tracker\n\n";
md += "> Auto-generated from `git issue` (git-native-issue). Issues are stored as orphan commits in\n";
md += "> `refs/issues/<uuid>` and referenced from docs via extended identifiers like `BUG-2025-002`.\n";
md += `> Total: **${recs.length}** · Open: **${open}** · Closed: **${closed}**\n\n`;
md += "Regenerate with `bun run docs:gen`.\n\n";

for (const type of order) {
  const list = groups[type];
  if (!list?.length) { continue; }
  md += `## ${type} Issues\n\n`;
  for (const r of list) {
    const st = stateByHash[r.hash]?.state ?? "open";
    const labels = stateByHash[r.hash]?.labels || r.label;
    const pri = stateByHash[r.hash]?.priority || r.priority;
    const human = r.title.replace(`${r.extid}: `, "",);
    md += `### ${r.extid}\n\n`;
    md += `- **Title:** ${human}\n`;
    md += `- **State:** ${st}\n`;
    md += `- **Labels:** ${labels}\n`;
    md += `- **Priority:** ${pri}\n`;
    if (r.epic) { md += `- **Epic:** ${r.epic}\n`; }
    md += `- **Source:** ${r.source}\n`;
    md += `- **Issue ID:** \`${r.hash}\`\n`;
    if (r.body) { md += `\n${r.body}\n`; }
    md += "\n";
  }
}

writeFileSync(OUT, md,);
console.log(`Wrote ${OUT} (${recs.length} issues, ${open} open / ${closed} closed)`,);
