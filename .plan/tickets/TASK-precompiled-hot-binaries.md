# TASK: Pre-Compiled Hot Binary Modules

**Status:** 🟡 In Progress — sample shipped (branch `native-blake3`, 2026-08-15); hot-reload + packaging open
**Priority:** Medium
**Effort:** High
**Epic:** epic-precompiled-hot-binaries

## Summary

Pre-compiled hot binary modules — native modules, FFI bindings, hot-reload support, and binary distribution. Covers native module compilation, hot-reload mechanism, and platform-specific binary packaging. Sample scope shipped: Rust cdylib (BLAKE3) + bun:ffi loader + pure-TS fallback + core-plugin health route + benchmark (53× native speedup).

## Acceptance Criteria

- [x] Native module compilation working — `bun run build:native` (conditional cargo build, Rust cdylib BLAKE3; TS default when toolchain absent)
- [ ] Hot-reload mechanism functional — dev binary-rebuild watcher (future)
- [ ] Platform-specific binary packaging operational — build-stage model only (gitignored `target/`); per-platform prebuilt matrix open
- [x] FFI bindings working — `bun:ffi` dlopen, ABI version gate, caller-buffer contract, fallback on any failure
- [x] Tests passing — 15 TS (vectors + native/fallback parity + status) + 9 Rust (fmt/clippy `-D warnings` green)
- [ ] Documentation updated — `docs/native-modules.md` pending (epic updated; dedicated doc open)

## Linked Epics

- `epic-precompiled-hot-binaries.md`
- `epic-testing-benchmarking.md` — benchmark suite bound (53× performance proof)
