<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Native/WASM Module Performance Benchmarks

**Status:** 🟡 In Progress — blake3 + zstd benchmarks shipped (2026-08-15, branch `native-blake3`)
**Priority:** High
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** benchmarking, ffi, wasm, native-modules, performance
**Parent Epic:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md)

## Overview

Benchmarks for the native module system (`epic-precompiled-hot-binaries`). Measures the performance delta between native FFI, WASM, and pure-JS fallbacks per module.

## Sub-Epic of

Part of the **Testing, Benchmarking & Performance** epic. See parent epic for shared targets; the module-specific comparison and loading tables live here.

## Shipped (2026-08-15, branch `native-blake3`)

- **First benchmark:** `tests/benchmarks/blake3.bench.ts` — native Rust
  cdylib vs @noble/hashes pure-TS on 1 MiB × 200 rounds, avg/min/max/stddev/
  p95, cold dlopen time. **Result: native 8.8 GB/s vs TS 170 MB/s → 53×**
  (module target delta 10×), cold load ~9 ms (< 50 ms target). Performance
  proof for the hot-binary epic is now bound to this suite.
- **Second benchmark (2026-08-15):** `tests/benchmarks/zstd.bench.ts` —
  Rust cdylib vs Bun built-in zstd on 1 MiB (compress + decompress).
  Result: Bun native zstd faster (~0.6× compress / ~0.4× decompress) — no
  pure-TS zstd exists; the Rust sample proves FFI integration +
  deterministic level control, and the fallback chain keeps the fastest
  codec in the loop.

## Module Comparison Targets

| Module             | Native (FFI) | WASM    | Pure-JS Fallback | Target Delta   |
| ------------------ | ------------ | ------- | ---------------- | -------------- |
| SHA-256 (1 MB)     | < 1ms        | < 3ms   | < 10ms           | Native 10x JS  |
| AES-256-GCM (1 MB) | < 1ms        | < 4ms   | < 15ms           | Native 10x JS  |
| gzip (1 MB)        | < 5ms        | < 15ms  | < 50ms           | Native 5x JS   |
| brotli (1 MB)      | < 10ms       | < 30ms  | < 100ms          | Native 5x JS   |
| zstd (1 MB)        | < 2ms        | < 8ms   | N/A              | Native 4x WASM |
| Image resize       | < 10ms       | < 50ms  | < 200ms          | Native 10x JS  |
| Thumbnail gen      | < 15ms       | < 80ms  | < 300ms          | Native 10x JS  |
| Embedding gen      | < 50ms       | < 200ms | < 1,000ms        | Native 10x JS  |

## Module Loading and Initialization

| Metric                     | Target   | Tier     | Notes                                   |
| -------------------------- | -------- | -------- | --------------------------------------- |
| Native module load (cold)  | < 50ms   | Baseline | First dlopen call                       |
| Native module load (warm)  | < 1ms    | Baseline | Subsequent loads, shared lib cached     |
| WASM module compile (cold) | < 200ms  | Baseline | WebAssembly.compile()                   |
| WASM module instantiate    | < 10ms   | Baseline | WebAssembly.instantiate()               |
| FFI call overhead          | < 0.01ms | Baseline | Single FFI call boundary                |
| WASM call overhead         | < 0.05ms | Baseline | Single WASM call boundary               |
| Module fallback detection  | < 1ms    | Baseline | Auto-detect: native, then WASM, then JS |

## Tasks

- [x] Benchmark BLAKE3: native FFI vs pure-JS — ✅ 53× (2026-08-15, `tests/benchmarks/blake3.bench.ts`)
- [x] Benchmark gzip/brotli/zstd: native FFI vs WASM vs pure-JS (fflate) — 🟡 zstd only: Rust FFI vs Bun native (2026-08-15); Bun faster, documented
- [ ] Benchmark SHA-256: native FFI vs WASM vs pure-JS (Web Crypto)
- [ ] Benchmark AES-256-GCM: native FFI vs WASM vs pure-JS
- [ ] Benchmark image resize: native FFI (libvips) vs WASM vs canvas API
- [ ] Benchmark thumbnail generation: native vs WASM vs canvas API
- [ ] Benchmark embedding generation: native ONNX vs WASM vs transformers.js
- [ ] Benchmark module load times: cold/warm across all three modes
- [ ] Benchmark FFI vs WASM call overhead (1K, 10K, 100K calls)
- [ ] Benchmark hot-reload: native module swap time under load
- [ ] Benchmark fallback chain: auto-detect overhead in practice
- [ ] Benchmark concurrent module access: thread safety under load

## Dependencies

- **Upstream:** Pre-Compiled Hot Binary Modules (epic-precompiled-hot-binaries.md) — this epic measures that system's modules; no benchmark without a shipped module.
- **Parent hub:** Testing, Benchmarking & Performance (epic-testing-benchmarking.md).
- **Siblings:** Benchmark CI & Performance Regression Detection (epic-benchmark-ci-regression.md) runs `bench:native` in CI.

## Files

- `tests/benchmarks/` — per-module benchmark suites (`blake3.bench.ts`, `zstd.bench.ts`, ...)
