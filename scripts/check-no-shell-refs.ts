// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Shell reference guard — flags `.sh` script usage in repo docs + scripts.
//
// Scans:
//   - AGENTS.md (repo root)
//   - .agents/  (recursive, all files)
//   - scripts/  (.md/.ts/.mjs only, excludes .sh files and node_modules)
//
// Recognizes false positives (skips):
//   - External install commands (curl ... | bash, pip install)
//   - Backward-compat notes mentioning worktree.sh
//   - Self-references in this file's comments
//
// Pattern: \.sh\b in file content excluding known false positives.
// Exit 0 if clean, 1 if violations found.

import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";
import { join, relative, resolve, } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..",);

// Patterns that are NOT actionable .sh references
const FALSE_POSITIVE_PATTERNS = [
  /curl.*install-latest\.sh/, // fossa install command
  /pip install/, // pip install references
  /worktree\.sh/, // worktree.sh references (wrapper, backward compat)
  /\.sh references/, // self-reference in comments
  /\.sh in/, // self-reference in comments
  /\.sh script/, // self-reference in comments
  /\.sh file/, // self-reference in comments
];

const PATTERN = /\.sh\b/g;

interface Violation {
  file: string;
  line: number;
  match: string;
}

function walkDir(dir: string,): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true, },);
  for (const entry of entries) {
    if (entry.name === "node_modules") { continue; }
    const full = join(dir, entry.name,);
    if (entry.isDirectory()) {
      files.push(...walkDir(full,),);
    } else {
      files.push(full,);
    }
  }
  return files;
}

function isFalsePositive(line: string,): boolean {
  return FALSE_POSITIVE_PATTERNS.some((fp,) => fp.test(line,));
}

function scanFile(absPath: string,): Violation[] {
  const content = readFileSync(absPath, "utf8",);
  const lines = content.split("\n",);
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (isFalsePositive(lines[i],)) { continue; }
    PATTERN.lastIndex = 0;
    const match = PATTERN.exec(lines[i],);
    if (match) {
      violations.push({
        file: relative(REPO_ROOT, absPath,),
        line: i + 1,
        match: match[0],
      },);
    }
  }

  return violations;
}

const allViolations: Violation[] = [];

// AGENTS.md
const agentsMd = resolve(REPO_ROOT, "AGENTS.md",);
if (existsSync(agentsMd,)) {
  allViolations.push(...scanFile(agentsMd,),);
}

// .agents/ recursive
const agentsDir = resolve(REPO_ROOT, ".agents",);
if (existsSync(agentsDir,)) {
  const files = walkDir(agentsDir,);
  for (const f of files) {
    allViolations.push(...scanFile(f,),);
  }
}

// scripts/ — only .md, .ts, .mjs, skip .sh files + self
const scriptsDir = resolve(REPO_ROOT, "scripts",);
if (existsSync(scriptsDir,)) {
  const scriptsFiles = readdirSync(scriptsDir, { withFileTypes: true, },);
  for (const entry of scriptsFiles) {
    if (entry.isDirectory()) { continue; }
    if (entry.name.endsWith(".sh",)) { continue; }
    if (entry.name === "check-no-shell-refs.ts") { continue; }
    if (!entry.name.endsWith(".md",) && !entry.name.endsWith(".ts",) && !entry.name.endsWith(".mjs",)) { continue; }
    allViolations.push(...scanFile(join(scriptsDir, entry.name,),),);
  }
}

// Report
if (allViolations.length > 0) {
  console.log(`[no-shell-refs] ${allViolations.length} .sh reference(s) found:\n`,);
  for (const v of allViolations) {
    console.log(`  ${v.file}:${v.line} — ${v.match}`,);
  }
  console.log(`\n[no-shell-refs] Migrate .sh references to portable alternatives.`,);
  process.exit(1,);
} else {
  console.log(`[no-shell-refs] ✓ No .sh references found.`,);
  process.exit(0,);
}
