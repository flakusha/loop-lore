// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Benchmark runner — discovers and executes `tests/benchmarks/*.bench.ts`.
 *
 * Usage:
 *   bun run bench              # run every benchmark (sorted, sequential)
 *   bun run bench blake3       # run only benches whose filename contains "blake3"
 *   bun run bench:ci           # same as `bun run bench` (epic CI-compatible name)
 *
 * Design (aligned with epic-testing-benchmarking.md):
 * - Discovery: `tests/benchmarks/` is the canonical bench suite dir.
 * - Isolation: each bench spawns its own Bun process — fresh native-module
 *   load per bench, no cross-bench state/JIT skew.
 * - Sequential: benches are CPU-bound; parallelism would distort results.
 * - Exit: non-zero if any bench fails; result parsing/regression comparison
 *   is deferred to the epic's BenchmarkFramework task (not this wrapper).
 */

import { readdirSync, } from "node:fs";
import { join, } from "node:path";

const BENCH_DIR = join(import.meta.dir, "..", "tests", "benchmarks",);
const BENCH_GLOB = /\.bench\.ts$/;

interface BenchFile {
  name: string;
  path: string;
}

function discoverBenches(filter?: string,): BenchFile[] {
  const files = readdirSync(BENCH_DIR,)
    .filter((fileName,) => BENCH_GLOB.test(fileName,))
    .sort();
  const benches = files.map((fileName,) => ({
    name: fileName.replace(BENCH_GLOB, "",),
    path: join(BENCH_DIR, fileName,),
  }));
  if (filter === undefined) {
    return benches;
  }
  const filtered = benches.filter(({ name, },) => name.includes(filter,));
  if (filtered.length === 0) {
    console.error(`[bench] no benchmarks match "${filter}". Available:\n${list(benches,)}`,);
    process.exit(1,);
  }
  return filtered;
}

function list(benches: BenchFile[],): string {
  return benches.map(({ name, },) => `  - ${name}`).join("\n",);
}

async function runBench({ name, path, }: BenchFile,): Promise<boolean> {
  console.log(`\n══════════════════════════════════════════════`,);
  console.log(`▶ ${name}`,);
  console.log(`══════════════════════════════════════════════`,);
  const started = performance.now();
  const process = Bun.spawn(["bun", "run", path,], { stdout: "inherit", stderr: "inherit", },);
  const exitCode = await process.exited;
  const elapsedMs = (performance.now() - started).toFixed(0,);
  const ok = exitCode === 0;
  console.log(`[${name}] ${ok ? "✓" : "✗"} exit=${exitCode} ${elapsedMs} ms`,);
  return ok;
}

async function main(): Promise<void> {
  const filter = process.argv[2];
  const benches = discoverBenches(filter,);
  console.log(`[bench] ${benches.length} benchmark(s): ${benches.map((b,) => b.name).join(", ",)}`,);

  let passed = 0;
  for (const bench of benches) {
    if (await runBench(bench,)) {
      passed++;
    }
  }

  console.log(`\n[bench] ${passed}/${benches.length} passed`,);
  if (passed !== benches.length) {
    process.exit(1,);
  }
}

void main();
