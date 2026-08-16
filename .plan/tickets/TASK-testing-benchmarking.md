<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: EPIC: Testing, Benchmarking & Performance

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High
**Epic:** epic-testing-benchmarking

## Summary

Comprehensive testing infrastructure including unit tests, e2e tests, benchmarking, performance testing, pressure/fuzzing, bottleneck detection, and security testing. Ensure good practices don't negatively impact performance while maintaining security and data integrity.

Extended with:

- Ultra-low latency hot-path targets (~1ms non-LLM round-trip)
- Concurrency and async execution model (Worker threads, Bun.spawn, task queues)
- Native/WASM module performance benchmarks (FFI vs WASM vs pure-JS)
- Per-component memory profiling targets (heap, RSS, GC pressure)

## Linked Epics

- `epic-testing-benchmarking.md`
- `epic-precompiled-hot-binaries.md` (Native/WASM module benchmarks)

## Acceptance Criteria

### Core Testing

- [ ] Unit test framework implemented
- [ ] Integration test framework implemented
- [ ] E2E test framework implemented
- [ ] Performance test framework implemented
- [ ] Security test framework implemented

### Performance Targets

- [ ] API p50 < 20ms (baseline) verified
- [ ] API p95 < 50ms (baseline) verified
- [ ] Full non-LLM round-trip < 1ms on localhost (hot-path) verified
- [ ] Message throughput > 500 msg/s (baseline) verified
- [ ] Concurrent sessions > 1,000 (baseline) verified

### Concurrency

- [ ] Worker thread spawn overhead < 5ms benchmarked
- [ ] Worker thread IPC throughput > 10,000 msg/s benchmarked
- [ ] Task queue throughput > 50,000 tasks/s benchmarked
- [ ] GC minor pause p50 < 0.5ms verified
- [ ] GC major pause p99 < 20ms verified

### Native/WASM Modules

- [ ] SHA-256 native FFI vs WASM vs JS benchmarked (10x target)
- [ ] AES-256-GCM native FFI vs WASM vs JS benchmarked (10x target)
- [ ] gzip/brotli/zstd native FFI vs WASM vs JS benchmarked (5x target)
- [ ] Image resize native FFI vs WASM vs JS benchmarked (10x target)
- [ ] Module load times cold/warm benchmarked

### Memory Profiling

- [ ] Per-component memory tracking implemented (heap, RSS, external)
- [ ] GC pause measurement per request handler implemented
- [ ] Memory leak detection (endurance tests) implemented
- [ ] Memory regression detection in CI implemented

### CI Integration

- [ ] Benchmark runner with baseline comparison implemented
- [ ] Regression threshold checking implemented
- [ ] CI workflow for perf regression implemented
- [ ] Historical results dashboard implemented
