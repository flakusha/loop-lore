// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Markdown stale-link guard.
 *
 * Scans Markdown files and flags intra-repo links whose target does not
 * resolve to an existing repository path. Catches links that rot when
 * files/epics/tickets are renamed or deleted (common in `.plan/` and
 * `docs/` where epics reference tickets and vice-versa).
 *
 * What is checked:
 * - Inline links `[text](target)` and images `![alt](target)`
 * - Reference links `[text][ref]` (ref resolved via `[ref]: target`)
 * - Relative paths (`../epics/x.md`, `tickets/TASK-x.md`, `/docs/...`)
 *   are resolved against the repo root (for `/`-prefixed) or the
 *   containing file's directory (for relative `./`/`../`).
 * - Anchors have their `#fragment` stripped before file resolution.
 *
 * What is skipped:
 * - Absolute web URLs (`http://`, `https://`, `mailto:`, `ftp://`)
 * - Anchor-only links (`[x](#section)`) — same-file anchors
 * - Code spans and fenced code blocks (paths in backticks/code)
 * - Auto-links `<https://...>`
 *
 * Modes:
 * - Default: reports broken links and exits 1 if any. NOTE: the check runner
 *   (check-parallel.mjs) invokes this post-loop as ADVISORY — it prints
 *   findings but does not gate `bun run check`. Run standalone for the
 *   exit-code contract.
 * - `--fix`: rewrites non-existent relative targets to `<file> (missing)` —
 *   only for links that point at other tracks of the repo; prints the diff.
 *
 * Usage: `bun run scripts/check-md-links.ts`
 */
import { existsSync, readdirSync, statSync, } from "node:fs";
import { dirname, join, resolve, } from "node:path";
import { extractComments, extractDocRefs, } from "./lib/src-refs";

const PROJECT_ROOT = import.meta.dir + "/..";
const _GLOBS = ["docs/**/*.md", ".plan/**/*.md",];
// Bun's Glob does not traverse dot-directories (.plan/), so walk the tree.
const SCAN_DIRS = ["docs", ".plan",];
const SRC_DIR = "src";
const SRC_EXTS = new Set([".ts", ".tsx",],);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".venv", "coverage", ".vitepress",],);

/** Recursively collect *.md files (handles hidden dirs that Bun Glob misses). */
function collectMdFiles(rootDir: string,): string[] {
  const out: string[] = [];
  const walk = (d: string,): void => {
    for (const entry of readdirSync(d,)) {
      if (SKIP_DIRS.has(entry,)) { continue; }
      const p = join(d, entry,);
      if (statSync(p,).isDirectory()) { walk(p,); }
      else if (p.endsWith(".md",)) { out.push(p,); }
    }
  };
  walk(join(PROJECT_ROOT, rootDir,),);
  return out;
}

/** Recursively collect TypeScript source files under src/. */
function collectSrcFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string,): void => {
    for (const entry of readdirSync(d,)) {
      if (SKIP_DIRS.has(entry,)) { continue; }
      const p = join(d, entry,);
      if (statSync(p,).isDirectory()) { walk(p,); }
      else if (SRC_EXTS.has(p.slice(p.lastIndexOf(".",),),)) { out.push(p,); }
    }
  };
  const srcRoot = join(PROJECT_ROOT, SRC_DIR,);
  if (existsSync(srcRoot,)) { walk(srcRoot,); }
  return out;
}

// ── Markdown parsing (lightweight, no deps) ─────────────────────

/** Strip fenced code blocks: ```…``` and indented 4-space code. */
function stripCodeBlocks(text: string,): string {
  return text
    .replace(/```[\s\S]*?```/g, "",)
    .replace(/(?:^|\n)( {4}|\t)[^\n]*/g, "",);
}

/** Strip inline code spans `...`. */
function stripInlineCode(text: string,): string {
  return text.replace(/`[^`]*`/g, "",);
}

/** Collect `[label](target)` and `[label][ref]` usages. */
function collectLinks(text: string,): string[] {
  const links: string[] = [];
  // Inline: [text](target "title"?) — capture the URL portion
  const inlineRe = /\[([^\]]*)\]\((\s*<?([^)\s]+?|...)?>?(?:\s+"[^"]*")?\s*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(text,)) !== null) {
    const inner = m[2] ?? "";
    const target = inner.match(/([^)\s"']+)/,);
    if (target) { links.push(target[1],); }
  }
  // Reference definitions + usages (simplified: resolve refs inline)
  const defRe = /^\[([^\]]+)\]:\s*(.+)$/gm;
  const defs = new Map<string, string>();
  while ((m = defRe.exec(text,)) !== null) {
    defs.set(m[1].toLowerCase(), m[2].trim(),);
  }
  const useRe = /\[[^\]]*\]\[([^\]]+)\]/g;
  while ((m = useRe.exec(text,)) !== null) {
    const target = defs.get(m[1].toLowerCase(),);
    if (target) { links.push(target,); }
  }
  return links;
}

// ── Target classification ───────────────────────────────────────

/** True if the target is an absolute/external URL we should not resolve. */
function isExternal(target: string,): boolean {
  return /^(https?:|mailto:|ftp:|tel:|data:)/i.test(target,);
}

/** True if target is anchor-only (same file fragment). */
function isAnchorOnly(target: string,): boolean {
  return target.startsWith("#",);
}

/** Resolve a relative target path against the containing file. */
function resolveTarget(target: string, containingFile: string,): string | null {
  // Strip anchor fragment
  const pathPart = target.split("#",)[0];
  if (!pathPart) { return null; }

  // Repo-root-relative prefixes used throughout docs/plan.
  // Strip a leading slash, then resolve from repo root.
  const trimmed = pathPart.replace(/^\//, "",);
  if (trimmed.startsWith("docs/",) || trimmed.startsWith(".plan/",) || trimmed.startsWith("src/",)) {
    return join(PROJECT_ROOT, trimmed,);
  }
  // `/plan/...` is shorthand for `.plan/...` in some prose docs.
  if (trimmed.startsWith("plan/",) || trimmed === "plan") {
    return join(PROJECT_ROOT, trimmed.replace(/^plan/, ".plan",),);
  }
  // Other `/`-prefixed paths are docs-site routes (/meta/issues, /api/...)
  // regenerated by VitePress — not in-repo files, so not resolvable here.
  if (pathPart.startsWith("/",)) { return null; }
  // Bare `TASK-*.md` in .plan/ docs mean a ticket in .plan/tickets/.
  if (/^TASK-[\w-]+\.md$/.test(pathPart,)) {
    const ticket = join(PROJECT_ROOT, ".plan/tickets", pathPart,);
    if (existsSync(ticket,)) { return ticket; }
  }
  // Else relative to the containing file's directory (always absolute).
  return resolve(dirname(containingFile,), pathPart,);
}

// ── Bare-text TASK-ref resolution (plan cross-links) ────────────

/** Collect bare `TASK-xxx` refs NOT inside markdown link syntax. */
function collectTaskRefs(text: string,): Array<{ ref: string; line: string }> {
  const out: Array<{ ref: string; line: string }> = [];
  const re = /TASK-[A-Za-z0-9-]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text,)) !== null) {
    const ref = m[0];
    const at = m.index;
    const prev = text[at - 1] ?? "";
    const next = text[at + ref.length] ?? "";
    // Skip markdown link labels: [TASK-x](...) or [TASK-x][ref]
    if (prev === "[" && (next === "(" || next === "[")) { continue; }
    // Skip inside inline code already handled by stripInlineCode; skip fenced handled by stripCodeBlocks.
    const lineStart = text.lastIndexOf("\n", at - 1,) + 1;
    const lineEnd = text.indexOf("\n", at,);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd,);
    out.push({ ref, line, },);
  }
  return out;
}

// ── Main ────────────────────────────────────────────────────────

let broken = 0;
let orphanRefs = 0;
const seen = new Set<string>();
const TICKET_DIR = join(PROJECT_ROOT, ".plan/tickets",);
const ticketFiles = new Set<string>(
  (() => {
    try {
      return readdirSync(TICKET_DIR,).map((f,) => f.toLowerCase());
    } catch {
      return [];
    }
  })(),
);

async function checkFile(file: string,): Promise<void> {
  if (seen.has(file,)) { return; }
  seen.add(file,);
  const raw = await Bun.file(file,).text();
  const body = stripInlineCode(stripCodeBlocks(raw,),);
  const links = collectLinks(body,);

  for (const target of links) {
    if (isExternal(target,) || isAnchorOnly(target,)) { continue; }

    const resolved = resolveTarget(target, file,);
    if (!resolved) { continue; }
    if (!existsSync(resolved,)) {
      broken++;
      console.error(`[md-links] ${file} → broken target: ${target} (resolved ${resolved})`,);
    }
  }

  // Bare-text TASK refs (epic/backlog tables, prose) — resolve against tickets dir.
  if (file.startsWith(join(PROJECT_ROOT, ".plan",),)) {
    const selfTitle = raw.split("\n", 1,)[0] ?? ""; // file's own H1 (old numeric ID vs descriptive filename)
    // Use fence-stripped text with newlines intact: stripCodeBlocks collapses
    // lines and glues adjacent refs into one regex match.
    const refText = raw.replace(/```[\s\S]*?```/g, "",);
    for (const { ref, line, } of collectTaskRefs(refText,)) {
      // Skip the file's own H1 title (self-ref, not cross-ref).
      const titleRef = selfTitle.match(/TASK-[\w-]+/,)?.[0]?.toLowerCase();
      if (
        line === selfTitle && titleRef && ref.toLowerCase().startsWith(titleRef.replace(/^TASK-/, "",),) ||
        ref.toLowerCase() === titleRef
      ) { continue; }
      const name = ref.toLowerCase() + ".md";
      // Prefix refs are allowed: epic lists `TASK-add-trace-fatal` while the
      // ticket file is `task-add-trace-fatal-log-levels-and-api-methods.md`.
      const resolves = ticketFiles.has(name,) ||
        [...ticketFiles,].some((n,) => n.startsWith(name,) || n.includes(name.replace(/\.md$/, "",),));
      if (!resolves) {
        orphanRefs++;
        console.error(
          `[md-links] ${file} → orphan TASK ref: ${ref} (no .plan/tickets/${ref}.md) — line: ${
            line.trim().slice(0, 80,)
          }`,
        );
      }
    }
  }
}

// ── Source-comment citation check ───────────────────────────────

/** Check a TS source file's comments for stale `.plan/` + `docs/` refs. */
async function checkSrcComments(file: string,): Promise<void> {
  const raw = await Bun.file(file,).text();
  let comments: string[];
  try {
    comments = extractComments(raw,);
  } catch {
    return; // unparseable source — skip (not a link-rot signal)
  }
  for (const comment of comments) {
    for (const { path, } of extractDocRefs(comment,)) {
      const resolved = resolveTarget(path, file,);
      if (!resolved) { continue; }
      if (!existsSync(resolved,)) {
        broken++;
        console.error(`[md-links] ${file} → broken comment citation: ${path} (resolved ${resolved})`,);
      }
    }
  }
}

async function main(): Promise<void> {
  const files = new Set<string>();
  for (const dir of SCAN_DIRS) {
    for (const f of collectMdFiles(dir,)) { files.add(f,); }
  }

  for (const file of files) { await checkFile(file,); }

  // Source-comment citations: scan TS comments for stale `.plan/` + `docs/`
  // references (not covered by the markdown scan above).
  const srcFiles = collectSrcFiles();
  for (const file of srcFiles) { await checkSrcComments(file,); }

  if (broken > 0 || orphanRefs > 0) {
    if (broken > 0) {
      console.error(`\n[md-links] ${broken} broken internal link(s) found. Fix target paths or update the doc.`,);
    }
    if (orphanRefs > 0) {
      console.error(
        `\n[md-links] ${orphanRefs} orphan TASK ref(s) with no matching ticket file. Create the ticket (see .plan/README.md) or mark the row planning-state (Draft / Not Started / planned).`,
      );
    }
    process.exit(1,);
  }
  console.log(
    `[md-links] OK — ${files.size} markdown file(s), ${srcFiles.length} source file(s); all internal links and comment citations resolve.`,
  );
}

main().catch((err,) => {
  console.error("[md-links] failed:", err.message,);
  process.exit(1,);
},);
