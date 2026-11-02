// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Split oversized generated `docs/plan-gen` pages for the VitePress docs build.
 *
 * Runs after `giwt plan sync-docs` and before `vitepress build docs` (see
 * `docs:build` in package.json). sync-docs mirrors the plan markdown 1:1 and
 * wipes the output directory, so this script sees fresh, unsplit input on
 * every build — it is idempotent by construction: on already-split input no
 * file exceeds the size limit and link rewriting is a no-op.
 *
 * For every top-level `docs/plan-gen/<name>.md` larger than the size limit:
 * - writes `docs/plan-gen/<name>/<section>.md` part pages (+ paginated parts),
 * - writes `docs/plan-gen/<name>/index.md` (original preamble + page list),
 * - deletes the original oversized file,
 * - rewrites markdown links across the docs tree that target the removed
 *   file (`<name>.md`, `./<name>.md`, `<name>.md#anchor`) to the new paths.
 */

import { mkdir, readdir, readFile, rm, stat, writeFile, } from "node:fs/promises";
import { dirname, join, relative, sep, } from "node:path";
import process from "node:process";
import {
  DEFAULT_ROWS_PER_PART,
  pageFooter,
  SIZE_LIMIT_BYTES,
  type SplitGroup,
  splitPageLines,
} from "./plan-gen-split-core";

const DIST_DIR = ".vitepress/dist";

interface SplitSummary {
  filesSplit: string[];
  pagesWritten: number;
  linksRewritten: number;
  unmappedAnchors: number;
}

/** Walk `root` recursively and return POSIX-style .md file paths. */
async function collectMarkdownFiles(root: string, skipDirs: string[],): Promise<string[]> {
  const files: string[] = [];
  const skip = new Set(skipDirs,);
  async function walk(dir: string,): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true, },)) {
      const full = join(dir, entry.name,);
      if (entry.isDirectory()) {
        if (skip.has(entry.name,)) { continue; }
        await walk(full,);
      } else if (entry.name.endsWith(".md",)) {
        files.push(full.split(sep,).join("/",),);
      }
    }
  }
  await walk(root,);
  return files.sort();
}

/** Rewrite every markdown link that targets one of the split files. */
async function rewriteLinks(options: {
  planGenDir: string;
  groups: SplitGroup[];
  files: string[];
  summary: SplitSummary;
},): Promise<void> {
  const { planGenDir, groups, files, summary, } = options;
  for (const group of groups) {
    const linkRe = new RegExp(`\\]\\((\\./)?${group.name}\\.md(#[^)]*)?\\)`, "g",);
    for (const file of files) {
      const before = await readFile(file, "utf8",);
      const after = before.replace(linkRe, (_match, dotSlash: string, anchor: string,) => {
        const slug = anchor ? anchor.slice(1,) : "";
        const target = slug === "" ? "index.md" : (group.anchorMap.get(slug,) ?? group.pages[0]?.fileName);
        if (target === undefined) {
          summary.unmappedAnchors += 1;
          return _match;
        }
        const targetAbs = join(planGenDir, group.name, target,);
        let rel = relative(dirname(file,), targetAbs,).split(sep,).join("/",);
        if (!rel.startsWith(".",)) { rel = `./${rel}`; }
        summary.linksRewritten += 1;
        return `](${rel}${anchor ?? ""})`;
      },);
      if (after !== before) { await writeFile(file, after,); }
    }
  }
}

/**
 * Split every oversized top-level plan-gen page and rewrite inbound links.
 *
 * @throws Error when the plan-gen directory is missing or a target file
 * disappeared mid-run.
 */
export async function runSplitPlanGen(options: {
  worktreeRoot: string;
  sizeLimitBytes?: number;
  rowsPerPart?: number;
},): Promise<SplitSummary> {
  const { worktreeRoot, } = options;
  const sizeLimitBytes = options.sizeLimitBytes ?? SIZE_LIMIT_BYTES;
  const rowsPerPart = options.rowsPerPart ?? DEFAULT_ROWS_PER_PART;
  const planGenDir = join(worktreeRoot, "docs", "plan-gen",);
  const statInfo = await stat(planGenDir,);
  if (!statInfo.isDirectory()) { throw new Error(`not a directory: ${planGenDir}`,); }

  const summary: SplitSummary = { filesSplit: [], pagesWritten: 0, linksRewritten: 0, unmappedAnchors: 0, };
  const groups: SplitGroup[] = [];
  for (const entry of await readdir(planGenDir, { withFileTypes: true, },)) {
    if (!entry.isFile() || !entry.name.endsWith(".md",)) { continue; }
    const full = join(planGenDir, entry.name,);
    if ((await stat(full,)).size <= sizeLimitBytes) { continue; }
    const name = entry.name.replace(/\.md$/, "",);
    const lines = (await readFile(full, "utf8",)).split("\n",);
    const group = splitPageLines({ name, lines, sizeLimitBytes, rowsPerPart, },);
    const groupDir = join(planGenDir, name,);
    await rm(groupDir, { recursive: true, force: true, },);
    await mkdir(groupDir, { recursive: true, },);
    const indexLines = [
      ...group.preamble,
      "",
      "## Sections",
      "",
      ...group.pages.map((page,) => `- [${page.title}](./${page.fileName})`),
      "",
    ];
    await writeFile(join(groupDir, "index.md",), indexLines.join("\n",),);
    summary.pagesWritten += 1;
    for (const [index, page,] of group.pages.entries()) {
      const footer = pageFooter({ pages: group.pages, index, indexHref: "./index.md", },);
      await writeFile(join(groupDir, page.fileName,), [...page.lines, ...footer,].join("\n",),);
      summary.pagesWritten += 1;
    }
    await rm(full,);
    groups.push(group,);
    summary.filesSplit.push(entry.name,);
  }

  if (groups.length > 0) {
    const files = (await collectMarkdownFiles(join(worktreeRoot, "docs",), [DIST_DIR,],)).filter(
      (file,) => !file.endsWith(".vitepress/cache",) && !file.includes(`${DIST_DIR}/`,),
    );
    await rewriteLinks({ planGenDir, groups, files, summary, },);
  }
  return summary;
}

/**
 * CLI entry point. Prints a one-line summary on success.
 *
 * @throws Error when splitting fails; exits non-zero via the caught error.
 */
async function main(): Promise<void> {
  const worktreeRoot = process.argv[2] ?? process.cwd();
  const summary = await runSplitPlanGen({ worktreeRoot, },);
  const parts = [
    `split ${summary.filesSplit.length} oversized plan-gen page(s)` +
    (summary.filesSplit.length > 0 ? `: ${summary.filesSplit.join(", ",)}` : ""),
    `${summary.pagesWritten} pages written`,
    `${summary.linksRewritten} links rewritten`,
  ];
  if (summary.unmappedAnchors > 0) { parts.push(`${summary.unmappedAnchors} unmapped anchors`,); }
  process.stdout.write(`${parts.join("; ",)}\n`,);
}

main().catch((error: unknown,) => {
  process.stderr.write(`split-plan-gen failed: ${error instanceof Error ? error.message : String(error,)}\n`,);
  process.exit(1,);
},);
