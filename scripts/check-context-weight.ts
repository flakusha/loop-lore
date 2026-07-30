// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context weight analysis for agent context files.
 *
 * Scans all context-bearing files (AGENTS.md, .opencode/context/,
 * .agents/references/, .agents/skills/) and reports their "weight"
 * — line count, byte size, and estimated token count (~4 chars/token).
 *
 * Modes:
 * - Default: human-readable table, exits 0
 * - `--json`: JSON output (machine-readable)
 * - `--strict`: exit 1 when total tokens exceed threshold
 * - `--threshold N`: override default 8000-token warning threshold
 * - `--budget ultra_lean|lean|balanced`: preset thresholds (8k/12k/15k)
 *
 * Usage:
 *   bun run scripts/check-context-weight.ts
 *   bun run scripts/check-context-weight.ts --json
 *   bun run scripts/check-context-weight.ts --strict --threshold 12000
 *   bun run scripts/check-context-weight.ts --budget lean
 */
import { Glob, } from "bun";
import { existsSync, readFileSync, } from "node:fs";
import { relative, resolve, } from "node:path";

// ── Args ──────────────────────────────────────────────────────

const args = process.argv.slice(2,);
const JSON_MODE = args.includes("--json",);
const STRICT = args.includes("--strict",);

const BUDGET_PRESETS: Record<string, number> = {
  ultra_lean: 8_000,
  lean: 12_000,
  balanced: 15_000,
};

const budgetArg = args.find((a,) => a.startsWith("--budget=",));
const budgetPreset = budgetArg
  ? BUDGET_PRESETS[budgetArg.split("=",)[1]]
  : undefined;

const thresholdArg = args.find((a,) => a.startsWith("--threshold=",));
const THRESHOLD = thresholdArg
  ? parseInt(thresholdArg.split("=",)[1], 10,)
  : budgetPreset ?? 8_000;

// ── File discovery ────────────────────────────────────────────

const ROOT = resolve(import.meta.dir, "..",);
const CONTEXT_GLOBS = [
  "AGENTS.md",
  "CLAUDE.md",
];
// Directories to scan with **/*.md
const CONTEXT_DIRS = [
  ".opencode/context",
  ".agents/references",
  ".agents/skills",
];

interface FileEntry {
  path: string;
  relPath: string;
  lines: number;
  bytes: number;
  tokens: number;
}

async function discoverFiles(): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const seen = new Set<string>();

  // Direct files
  for (const file of CONTEXT_GLOBS) {
    const abs = resolve(ROOT, file,);
    if (!existsSync(abs,)) { continue; }
    const content = readFileSync(abs, "utf8",);
    const lines = content.split("\n",).length;
    const bytes = Buffer.byteLength(content, "utf8",);
    const tokens = Math.ceil(bytes / 4,);

    entries.push({
      path: abs,
      relPath: relative(ROOT, abs,),
      lines,
      bytes,
      tokens,
    },);
    seen.add(abs,);
  }

  // Directory scans
  for (const dir of CONTEXT_DIRS) {
    const glob = new Glob("**/*.md",);
    for await (const file of glob.scan({ cwd: resolve(ROOT, dir,), },)) {
      const abs = resolve(ROOT, dir, file,);
      if (seen.has(abs,)) { continue; }
      seen.add(abs,);

      if (!existsSync(abs,)) { continue; }
      const content = readFileSync(abs, "utf8",);
      const lines = content.split("\n",).length;
      const bytes = Buffer.byteLength(content, "utf8",);
      const tokens = Math.ceil(bytes / 4,);

      entries.push({
        path: abs,
        relPath: relative(ROOT, abs,),
        lines,
        bytes,
        tokens,
      },);
    }
  }

  return entries.sort((a, b,) => b.tokens - a.tokens);
}

// ── Output ────────────────────────────────────────────────────

function formatBytes(bytes: number,): string {
  if (bytes < 1024) { return `${bytes}B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1,)}KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(2,)}MB`;
}

function formatTokens(tokens: number,): string {
  if (tokens >= 1000) { return `${(tokens / 1000).toFixed(1,)}k`; }
  return `${tokens}`;
}

function printTable(entries: FileEntry[], total: FileEntry,): void {
  const pad = (s: string, n: number,) => s.padEnd(n,);
  const rpad = (s: string, n: number,) => s.padStart(n,);

  console.log("┌" + "─".repeat(48,) + "┬" + "─".repeat(8,) + "┬" + "─".repeat(9,) + "┬" + "─".repeat(10,) + "┐",);
  console.log(
    "│" + pad(" File", 48,) +
      "│" + rpad("Lines", 8,) +
      "│" + rpad("Size", 9,) +
      "│" + rpad("Tokens", 10,) +
      "│",
  );
  console.log("├" + "─".repeat(48,) + "┼" + "─".repeat(8,) + "┼" + "─".repeat(9,) + "┼" + "─".repeat(10,) + "┤",);

  for (const e of entries) {
    const path = e.relPath.length > 47 ? "…" + e.relPath.slice(-46,) : e.relPath;
    console.log(
      "│ " + pad(path, 47,) +
        "│" + rpad(String(e.lines,), 8,) +
        "│" + rpad(formatBytes(e.bytes,), 9,) +
        "│" + rpad(formatTokens(e.tokens,), 10,) +
        "│",
    );
  }

  console.log("├" + "─".repeat(48,) + "┼" + "─".repeat(8,) + "┼" + "─".repeat(9,) + "┼" + "─".repeat(10,) + "┤",);
  console.log(
    "│ " + pad("TOTAL", 47,) +
      "│" + rpad(String(total.lines,), 8,) +
      "│" + rpad(formatBytes(total.bytes,), 9,) +
      "│" + rpad(formatTokens(total.tokens,), 10,) +
      "│",
  );
  console.log("└" + "─".repeat(48,) + "┴" + "─".repeat(8,) + "┴" + "─".repeat(9,) + "┴" + "─".repeat(10,) + "┘",);

  console.log(`\nThreshold: ${formatTokens(THRESHOLD,)} tokens`,);
  if (total.tokens > THRESHOLD) {
    console.log(
      `⚠ Context weight ${formatTokens(total.tokens,)} exceeds ${formatTokens(THRESHOLD,)} — consider compressing`,
    );
  } else {
    console.log(`✓ Context weight ${formatTokens(total.tokens,)} within budget`,);
  }
}

// ── Main ──────────────────────────────────────────────────────

const entries = await discoverFiles();

const total: FileEntry = {
  path: "",
  relPath: "TOTAL",
  lines: entries.reduce((s, e,) => s + e.lines, 0,),
  bytes: entries.reduce((s, e,) => s + e.bytes, 0,),
  tokens: entries.reduce((s, e,) => s + e.tokens, 0,),
};

if (JSON_MODE) {
  const output = {
    files: entries.map((e,) => ({
      path: e.relPath,
      lines: e.lines,
      bytes: e.bytes,
      tokens: e.tokens,
    })),
    total: {
      lines: total.lines,
      bytes: total.bytes,
      tokens: total.tokens,
    },
    threshold: THRESHOLD,
    overBudget: total.tokens > THRESHOLD,
  };
  console.log(JSON.stringify(output, null, 2,),);
} else {
  console.log("=== Context Weight Analysis ===\n",);
  printTable(entries, total,);
}

if (STRICT && total.tokens > THRESHOLD) {
  process.exit(1,);
}
