// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * zstd compression benchmark — Rust cdylib vs Bun built-in native zstd.
 *
 * Second entry in the `tests/benchmarks/` suite (epic-testing-benchmarking
 * Native Module section, epic-precompiled-hot-binaries Phase 4). Measures
 * cold-load reuse, compress + decompress throughput on a 1 MiB payload,
 * with avg/min/max/stddev/p95 and speedup. Run via `bun run bench zstd`.
 *
 * Note: both paths are native (Rust FFI vs Bun's built-in zstd) — there is
 * no pure-TS zstd worth benchmarking; the delta isolates FFI-call overhead
 * and codec implementation.
 *
 * 2026-08-15 result: Bun's built-in zstd is faster than the Rust FFI path
 * (~0.6× compress, ~0.4× decompress on this machine) — Bun ships a highly
 * tuned native zstd. The Rust sample's value here is the integration
 * mechanics (FFI + deterministic level control + cross-validation), not
 * raw speed; the fallback chain keeps the fastest codec in the loop.
 */

import { performance, } from "node:perf_hooks";
import { getNativeStatus, } from "../../src/native/loader";
import { zstdCompress, zstdDecompress, } from "../../src/native/zstd";

const BENCHMARK_ID = "native-zstd.throughput";
const PAYLOAD_BYTES = 1 << 20; // 1 MiB (redundant — compresses well)
const WARMUP = 10;
const ITERATIONS = 50;

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

/** Bun's built-in zstd — the fallback implementation under test. */
interface BunZstd {
  zstdCompressSync(data: Uint8Array, options?: { level?: number },): Uint8Array;
  zstdDecompressSync(data: Uint8Array,): Uint8Array;
}
const bunZstd = Bun as unknown as BunZstd;

const payload = new Uint8Array(PAYLOAD_BYTES,).map((_, i,) => (i % 4)); // redundant

// Rust cdylib (FFI) vs Bun built-in — both native, isolates FFI overhead.
const native = bench(zstdCompress, payload,);
const bunNative = bench((d,) => bunZstd.zstdCompressSync(d, { level: 3, },), payload,);

const frame = zstdCompress(payload,);
const nativeDecompress = bench((d,) => zstdDecompress(d,), frame,);
const bunDecompress = bench((d,) => bunZstd.zstdDecompressSync(d,), frame,);
// Decompress throughput is measured against the *decompressed* size, so
// override the summarized payload accounting.
nativeDecompress.throughputMiBs = (PAYLOAD_BYTES * nativeDecompress.iterations) / (nativeDecompress.totalMs / 1000) /
  (1024 * 1024);
bunDecompress.throughputMiBs = (PAYLOAD_BYTES * bunDecompress.iterations) / (bunDecompress.totalMs / 1000) /
  (1024 * 1024);

const status = getNativeStatus();
const results = { id: BENCHMARK_ID, native, bunNative, nativeDecompress, bunDecompress, };
console.log(JSON.stringify(results, null, 2,),);

console.log(`\n[${BENCHMARK_ID}] payload ${PAYLOAD_BYTES} bytes × ${ITERATIONS} rounds, warmup ${WARMUP}`,);
console.log(`implementation : ${status.available ? "rust" : "bun-native"} (nativeAvailable=${status.available})`,);
console.log(
  `compress   rust : ${native.averageMs.toFixed(4,)} ms/op  ${native.throughputMiBs.toFixed(1,)} MB/s  p95 ${
    native.p95Ms.toFixed(4,)
  } ms`,
);
console.log(
  `compress   bun  : ${bunNative.averageMs.toFixed(4,)} ms/op  ${bunNative.throughputMiBs.toFixed(1,)} MB/s  p95 ${
    bunNative.p95Ms.toFixed(4,)
  } ms`,
);
console.log(`compress   speedup: ${(bunNative.averageMs / native.averageMs).toFixed(1,)}×`,);
console.log(
  `decompress rust : ${nativeDecompress.averageMs.toFixed(4,)} ms/op  ${
    nativeDecompress.throughputMiBs.toFixed(1,)
  } MB/s`,
);
console.log(
  `decompress bun  : ${bunDecompress.averageMs.toFixed(4,)} ms/op  ${bunDecompress.throughputMiBs.toFixed(1,)} MB/s`,
);
