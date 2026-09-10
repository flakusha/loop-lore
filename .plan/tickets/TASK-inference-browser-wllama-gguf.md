# TASK: feat(inference): browser wllama GGUF inference infrastructure

**Status:** ✅ Finished (2026-09-10)
git issue: 85fca038d
**Priority:** high
**Tags:** ["inference", "gguf", "wllama", "browser", "llama.cpp"]

## Summary

5-commit cluster establishing browser-side GGUF inference via wllama: model downloader with SHA-256 verify, llama.cpp WASM tunnel connector with backoff, per-file model manifest with catalog, model manager UI, and native GGUF header probe with TypeScript WASM-first fallback.

## Implementation

- `src/frontend/alpine/model-downloader.ts` + `.test.ts` — resume-capable download with SHA-256 verification
- `src/frontend/alpine/model-storage-idb.ts` — IndexedDB storage for model blobs
- `src/frontend/alpine/model-storage.test.ts` — storage roundtrip tests
- `src/frontend/alpine/tunnel-connector.ts` + `.test.ts` — llama.cpp WASM tunnel with backoff retry
- `src/frontend/alpine/tunnel-protocol.ts` — tunnel protocol types
- `src/frontend/alpine/model-catalog.ts` + `.test.ts` — per-file model manifest with catalog download
- `src/frontend/alpine/catalog-download.ts` + `.test.ts` — catalog fetch + verify
- `src/frontend/alpine/model-manager.ts` + `.test.ts` — model manager UI with catalog + storage
- `native/loop-lore-native/src/gguf.rs` — native GGUF header probe
- `native/loop-lore-native/src/lib.rs` — native lib entry with gguf export

## Commits

- `85fca038d` feat(inference): browser model downloader with resume and SHA-256 verify
- `12cda3d3a` feat(inference): model manager UI with catalog and storage
- `cb45e88e0` feat(inference): llama.cpp tunnel connector with backoff
- `54092ae6e` feat(inference): per-file model manifest with catalog download
- `3b92eeb37` feat(native): gguf header probe with wasm-first TS fallback
## Acceptance Criteria

- [x] Browser can download GGUF model files with SHA-256 verification
- [x] Download resumes after interruption
- [x] Tunnel connector connects to llama.cpp WASM with backoff
- [x] Per-file model manifest entries have catalog + download info
- [x] Model manager UI shows catalog and storage state
- [x] Native GGUF header probe available via FFI
- [x] All tests passing

## Resolution

Landed on dev `2026-09-10`. All frontend alpine inference tests pass.
