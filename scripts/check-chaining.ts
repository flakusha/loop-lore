// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Method chaining guard (CI-level, grep-based).
// Flags .foo().bar() patterns where both are arbitrary methods.
// ESLint no-restricted-syntax can only target specific names.
// This catches ANY two-step chain on the same line.
//
// Scope: src/**/*.ts (excludes tests, scripts, .d.ts)
// Exemptions: known-safe patterns (.toLowerCase().trim(), Kysely DDL, etc.)
// Exit 0 always (warn only). Change to process.exit(1) to enforce.

import { Glob, } from "bun";

const CHAIN_PATTERN = /\.\w+\(\)(?:\s*)\.\w+\(\)/g;

const SAFE_CHAINS = [
  ".trim().split(",
  ".toString().length",
  ".toString().padStart(",
  ".toString().padEnd(",
  ".toString().toLowerCase(",
  ".toString().toUpperCase(",
  ".trim().toLowerCase(",
  ".trim().toUpperCase(",
  ".trim().length",
  ".toLowerCase().trim(",
  ".ifExists().execute(",
  ".notNull().unique(",
  ".selectAll().execute(",
  ".selectFrom().execute(",
  ".insertInto().execute(",
  ".deleteFrom().execute(",
  ".updateTable().execute(",
];

const glob = new Glob("src/**/*.ts",);
let violations = 0;
const filesWithViolations: string[] = [];

for await (const file of glob.scan()) {
  if (file.includes(".test.",) || file.includes("/scripts/",)) { continue; }
  if (file.endsWith(".d.ts",)) { continue; }

  const text = await Bun.file(file,).text();
  const lines = text.split("\n",);
  let fileViolations = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(CHAIN_PATTERN,);
    if (!matches) { continue; }

    for (const match of matches) {
      const isSafe = SAFE_CHAINS.some((safe,) => match.includes(safe,));
      if (isSafe) { continue; }

      const dotParts = match.split(".",).filter(Boolean,);
      if (dotParts.every((p,) => p.replace("()", "",).length <= 2)) { continue; }

      console.warn(
        `[chaining] ${file}:${i + 1} - chained call: ${match}. Consider splitting.`,
      );
      fileViolations++;
    }
  }

  if (fileViolations > 0) {
    filesWithViolations.push(file,);
    violations += fileViolations;
  }
}

if (violations > 0) {
  console.warn(`[chaining] ${violations} chained call(s) across ${filesWithViolations.length} file(s).`,);
  console.warn("[chaining] Consider splitting chains into separate statements for clarity.",);
}

process.exit(0,);
