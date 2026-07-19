#!/usr/bin/env bun
/**
 * Append/replace a sentinel-guarded "Tracked as Git Issues" section in the task docs,
 * cross-linking each migrated task to its issue in /meta/issues.
 *
 * Usage: bun run scripts/gen-doc-issue-maps.ts
 */
import { existsSync, readFileSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";

const ROOT = process.cwd();
const INDEX = join(ROOT, ".plan/tickets/index.json",);
const idx = existsSync(INDEX,) ? JSON.parse(readFileSync(INDEX, "utf8",),) : {};

type MapRec = {
  extid: string;
  title: string;
  priority: string;
  source: string;
};

const recs = Object.values(idx,) as MapRec[];

function sectionFor(filter: (r: MapRec,) => boolean,): string {
  const rows = recs.filter(filter,);
  if (!rows.length) { return ""; }
  const lines = [
    "<!-- ISSUE-MAP-START -->",
    "## Tracked as Git Issues",
    "",
    "> These tasks are tracked as git-native-issues. See the [Issue Tracker](/meta/issues) for live state.",
    "",
    "| Issue | Title | Priority | Source |",
    "| ------ | ----- | -------- | ------ |",
  ];
  for (const r of rows.sort((a, b,) => a.extid.localeCompare(b.extid,))) {
    const anchor = r.extid.toLowerCase();
    const src = r.source.replace(/^docs\//, "",).replace(/\.md$/, "",);
    lines.push(
      `| [${r.extid}](/meta/issues/#${anchor}) | ${
        r.title.replace(`${r.extid}: `, "",)
      } | ${r.priority} | [${src}](/${src}) |`,
    );
  }
  lines.push("", "<!-- ISSUE-MAP-END -->", "",);
  return lines.join("\n",);
}

function upsert(file: string, section: string,) {
  const path = join(ROOT, file,);
  if (!existsSync(path,)) { return; }
  let content = readFileSync(path, "utf8",);
  if (content.includes("<!-- ISSUE-MAP-START -->",)) {
    content = content.replace(
      /<!-- ISSUE-MAP-START -->[\s\S]*?<!-- ISSUE-MAP-END -->/,
      section.trim(),
    );
  } else {
    content = content.replace(/\n*$/, "\n\n" + section,);
  }
  writeFileSync(path, content,);
  console.log(`updated ${file} (${section.split("\n",).length} lines)`,);
}

upsert("docs/meta/open-items.md", sectionFor((r,) => r.source.includes("open-items",)),);
upsert("docs/meta/backlog.md", sectionFor((r,) => r.source.includes("backlog",)),);
upsert("docs/meta/roadmap.md", sectionFor((r,) => r.source.includes("roadmap",)),);
