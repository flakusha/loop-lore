// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BLAKE3 native-vs-fallback benchmark — first entry in the
 * `tests/benchmarks/` suite (epic-testing-benchmarking.md, benchmark
 * framework structure TASK).
 *
 * Measures: cold module load (dlopen), FFI call overhead, native (Rust
 * cdylib) vs pure-TS fallback throughput on a 1 MiB payload, with
 * average/min/max/stddev and p95. Run via `bun run bench:native` — kept
 * out of the `bun test` unit gate (performance, not correctness).
 *
 * Shape follows the epic's Benchmark/BenchmarkResult contract
 * (id/name/iterations/warmup + percentiles) — a standalone script until
 * the full BenchmarkFramework exists.
 */

import { performance, } from "node:perf_hooks";
import { blake3Hash, getBlake3Status, } from "../../src/native";
import { blake3Hash as fallbackBlake3, } from "../../src/native/fallback/blake3";
import { getNativeModule, getNativeStatus, } from "../../src/native/loader";

const BENCHMARK_ID = "native-blake3.throughput";
const PAYLOAD_BYTES = 1 << 20; // 1 MiB
const WARMUP = 20;
const ITERATIONS = 200;

interface Sample {
  name: string;
  iterations: number;
  totalMs: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  stddevMs: number;
  p95Ms: number;
  throughputMiBs: number;
}

function summarize(name: string, samplesMs: number[], payloadBytes: number,): Sample {
  const sorted = [...samplesMs,].sort((a, b,) => a - b);
  const mean = samplesMs.reduce((a, b,) => a + b, 0,) / samplesMs.length;
  const variance = samplesMs.reduce((a, b,) => a + (b - mean) ** 2, 0,) / samplesMs.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95,),)];
  const totalMs = samplesMs.reduce((a, b,) => a + b, 0,);
  const bytesPerSec = (payloadBytes * samplesMs.length) / (totalMs / 1000);
  return {
    name,
    iterations: samplesMs.length,
    totalMs,
    averageMs: mean,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    stddevMs: Math.sqrt(variance,),
    p95Ms: p95,
    throughputMiBs: bytesPerSec / (1024 * 1024),
  };
}

function bench(fn: (data: Uint8Array,) => Uint8Array, data: Uint8Array,): Sample {
  for (let i = 0; i < WARMUP; i++) {
    fn(data,);
  }
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    fn(data,);
    samples.push(performance.now() - start,);
  }
  return summarize("", samples, data.length,);
}

function measureColdLoadMs(): number {
  // dlopen happens once per process (cached); force a fresh measurement by
  // timing the first getNativeModule() call against the loader's cache.
  const start = performance.now();
  getNativeModule();
  return performance.now() - start;
}

const payload = new Uint8Array(PAYLOAD_BYTES,).map((_, i,) => (i % 251));

// Cold dlopen must be measured BEFORE any other native use — the loader
// caches the handle, so a later call would measure a cache hit (~0 ms).
const coldLoadMs = measureColdLoadMs();

const native = bench(blake3Hash, payload,);
const fallback = bench(fallbackBlake3, payload,);
const status = getBlake3Status();
const nativeInfo = getNativeStatus();

const results = { id: BENCHMARK_ID, native, fallback, coldLoadMs, };
console.log(JSON.stringify(results, null, 2,),);

console.log(`\n[${BENCHMARK_ID}] payload ${PAYLOAD_BYTES} bytes × ${ITERATIONS} rounds, warmup ${WARMUP}`,);
console.log(`implementation : ${status.implementation} (nativeAvailable=${status.nativeAvailable})`,);
console.log(`cold load      : ${coldLoadMs.toFixed(3,)} ms (epic target: < 50 ms)`,);
console.log(
  `native   (FFI) : ${native.averageMs.toFixed(4,)} ms/op avg  ${native.throughputMiBs.toFixed(1,)} MB/s  p95 ${
    native.p95Ms.toFixed(4,)
  } ms`,
);
console.log(
  `fallback (TS)  : ${fallback.averageMs.toFixed(4,)} ms/op avg  ${fallback.throughputMiBs.toFixed(1,)} MB/s  p95 ${
    fallback.p95Ms.toFixed(4,)
  } ms`,
);
console.log(`speedup        : ${(fallback.averageMs / native.averageMs).toFixed(1,)}×`,);
if (nativeInfo.binaryPath !== undefined) {
  console.log(`binary         : ${nativeInfo.binaryPath}`,);
}
