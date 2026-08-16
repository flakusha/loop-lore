// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * audit-runtime-compat.ts — Scan source for Bun-specific APIs.
 *
 * Reports every use of `Bun.*` globals and `bun:*` protocol imports with
 * suggested Deno / Node equivalents so the migration path is visible.
 *
 * Runs under both Bun and Deno (only `node:*` builtins used).
 *
 * Usage:
 *   bun run scripts/audit-runtime-compat.ts            # pretty table
 *   bun run scripts/audit-runtime-compat.ts --json      # JSON output
 *   bun run scripts/audit-runtime-compat.ts --strict    # exit 1 if hits found
 *   bun run scripts/audit-runtime-compat.ts --shared    # only shared modules
 */

import { readdirSync, readFileSync, } from "node:fs";
import { join, relative, resolve, } from "node:path";
import process from "node:process";

// ── Compat map ─────────────────────────────────────────────────

interface CompatEntry {
  deno: string;
  node: string;
  status: "shim" | "native" | "none";
}

const BUN_API_COMPAT: Record<string, CompatEntry> = {
  "Bun.serve": { deno: "Deno.serve()", node: "node:http createServer", status: "native", },
  "Bun.file": { deno: "Deno.open() / Deno.readFile()", node: "node:fs readFile", status: "native", },
  "Bun.password.hash": { deno: "node:crypto scrypt (via npm:)", node: "node:crypto scrypt", status: "shim", },
  "Bun.password.verify": { deno: "node:crypto scrypt (via npm:)", node: "node:crypto scrypt", status: "shim", },
  "Bun.spawn": { deno: "Deno.Command()", node: "node:child_process", status: "native", },
  "Bun.spawnSync": { deno: "new Deno.Command().outputSync()", node: "node:child_process execSync", status: "native", },
  "Bun.which": { deno: "which (npm:which)", node: "which (npm:which)", status: "shim", },
  "Bun.CryptoHasher": { deno: "node:crypto createHash", node: "node:crypto createHash", status: "native", },
  "Bun.argv": { deno: "Deno.args", node: "process.argv", status: "native", },
  "Bun.stdin": { deno: "Deno.stdin", node: "process.stdin", status: "native", },
  "Bun.zstdCompressSync": { deno: "npm:@aspect-build/zstd", node: "npm:@aspect-build/zstd", status: "shim", },
  "Bun.zstdDecompressSync": { deno: "npm:@aspect-build/zstd", node: "npm:@aspect-build/zstd", status: "shim", },
  "Bun.Buffer": { deno: "Uint8Array / Buffer (node:)", node: "node:buffer Buffer", status: "native", },
};

const BUN_PROTO_COMPAT: Record<string, CompatEntry> = {
  "bun:sqlite": { deno: "npm:better-sqlite3 / npm:libsql", node: "npm:better-sqlite3", status: "shim", },
  "bun:ffi": { deno: "Deno.dlopen (unstable)", node: "node:ffi / koffi", status: "shim", },
  "bun:js": { deno: "no equivalent", node: "no equivalent", status: "none", },
  "bun:wrap": { deno: "no equivalent", node: "no equivalent", status: "none", },
  "bun:globals": { deno: "no equivalent", node: "no equivalent", status: "none", },
};

// ── Shared-module paths (no runtime-specific code allowed) ─────

const SHARED_MODULE_GLOBS = [
  "src/utils/",
  "src/services/",
  "src/validation/",
  "src/rpg/",
  "src/characters/",
  "src/memory/",
  "src/i18n/",
  "src/group-chat/",
  "src/profanity/",
  "src/notifications/",
  "src/personas/",
];

// ── Scanner ────────────────────────────────────────────────────

interface Finding {
  file: string;
  line: number;
  col: number;
  api: string;
  code: string;
  deno: string;
  node: string;
  status: "shim" | "native" | "none";
  shared: boolean;
}

function walkTsFiles(dir: string,): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true, },);
  for (const e of entries) {
    const full = join(dir, e.name,);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === "data") { continue; }
      out.push(...walkTsFiles(full,),);
    } else if (e.name.endsWith(".ts",) && !e.name.endsWith(".d.ts",)) {
      out.push(full,);
    }
  }
  return out;
}

function isSharedModule(filePath: string,): boolean {
  const rel = relative(resolve(".",), filePath,);
  return SHARED_MODULE_GLOBS.some((g,) => rel.startsWith(g,));
}

function scanFile(filePath: string,): Finding[] {
  const findings: Finding[] = [];
  const content = readFileSync(filePath, "utf8",);
  const lines = content.split("\n",);
  const relPath = relative(resolve(".",), filePath,);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Skip comments
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//",) || trimmed.startsWith("*",) || trimmed.startsWith("/*",)) { continue; }

    // bun: protocol imports
    for (const [proto, compat,] of Object.entries(BUN_PROTO_COMPAT,)) {
      const re = new RegExp(`from\\s+["']${proto.replace(":", "\\:",)}["']`,);
      const match = re.exec(line,);
      if (match) {
        findings.push({
          file: relPath,
          line: i + 1,
          col: match.index + 1,
          api: proto,
          code: trimmed,
          deno: compat.deno,
          node: compat.node,
          status: compat.status,
          shared: isSharedModule(filePath,),
        },);
      }
    }

    // Bun.* API calls (sorted longest-first for greedy match)
    const apis = Object.keys(BUN_API_COMPAT,).sort((a, b,) => b.length - a.length);
    for (const api of apis) {
      const escaped = api.replace(".", "\\.",);
      const re = new RegExp(escaped, "g",);
      let match: RegExpExecArray | null;
      while ((match = re.exec(line,)) !== null) {
        // Skip if inside a comment or string that's just documenting
        const before = line.slice(0, match.index,).trimStart();
        if (before.startsWith("//",) || before.startsWith("*",)) { break; }

        findings.push({
          file: relPath,
          line: i + 1,
          col: match.index + 1,
          api,
          code: trimmed,
          deno: BUN_API_COMPAT[api]!.deno,
          node: BUN_API_COMPAT[api]!.node,
          status: BUN_API_COMPAT[api]!.status,
          shared: isSharedModule(filePath,),
        },);
      }
    }
  }
  return findings;
}

// ── Output formatters ──────────────────────────────────────────

function printTable(findings: Finding[],): void {
  if (findings.length === 0) {
    process.stdout.write("✓ No Bun-specific APIs found.\n",);
    return;
  }

  // Group by API
  const byApi = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = byApi.get(f.api,) ?? [];
    arr.push(f,);
    byApi.set(f.api, arr,);
  }

  process.stdout.write(`\nFound ${findings.length} Bun-specific usage(s):\n\n`,);

  for (const [api, hits,] of byApi) {
    const first = hits[0]!;
    const statusTag = first.status === "native" ? "≈native" : first.status === "shim" ? "⚠ shim" : "✗ no-equiv";
    process.stdout.write(`  ${api}  [${statusTag}]\n`,);
    process.stdout.write(`    deno: ${first.deno}\n`,);
    process.stdout.write(`    node: ${first.node}\n`,);
    for (const h of hits) {
      const shared = h.shared ? " ← SHARED" : "";
      process.stdout.write(`    ${h.file}:${h.line}${shared}\n`,);
    }
    process.stdout.write("\n",);
  }

  const sharedCount = findings.filter((f,) => f.shared).length;
  if (sharedCount > 0) {
    process.stdout.write(`⚠ ${sharedCount} usage(s) in shared modules (need abstraction layer)\n`,);
  }
}

// ── CLI ────────────────────────────────────────────────────────

if (import.meta.main) {
  const argv = process.argv.slice(2,);
  const json = argv.includes("--json",);
  const strict = argv.includes("--strict",);
  const sharedOnly = argv.includes("--shared",);

  const srcDir = resolve("src",);
  const files = walkTsFiles(srcDir,);
  let findings: Finding[] = [];
  for (const f of files) {
    findings.push(...scanFile(f,),);
  }

  if (sharedOnly) {
    findings = findings.filter((f,) => f.shared);
  }

  if (json) {
    process.stdout.write(JSON.stringify(findings, null, 2,) + "\n",);
  } else {
    printTable(findings,);
  }

  if (strict && findings.length > 0) {
    process.exit(1,);
  }
}
