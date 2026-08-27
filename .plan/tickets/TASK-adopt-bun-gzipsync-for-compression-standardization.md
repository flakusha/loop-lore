# TASK: Adopt Bun.gzipSync for compression standardization

**Status:** 🟢 Partial (adopted in `adopt-bun-features`)
**Priority:** medium
**Effort:** Medium

## Summary

Replace node:zlib with Bun.gzipSync/gunzipSync/deflateSync/inflateSync. Single API surface, native code, consistent error handling.

## Acceptance Criteria

- [x] Implementation complete (gzip path landed in `adopt-bun-features`, commit `1b2b6da9 perf(transport): adopt Bun.gzipSync/gunzipSync`)
- [x] Tests passing (16/16 `src/transport/compression.test.ts`)
- [x] Documentation updated (inline lean-ctx comment in `src/transport/compression.ts`)

## Adoption status (2026-08-27)

Adopted for the gzip-only path in `src/transport/compression.ts` (compress + decompress round-trips). Brotli and zstd stay on `node:zlib` / `Bun.zstd*` respectively because Bun has no brotli equivalent. Remaining work (deferred):

- `src/utils/safe-buffer/compression.ts`, `src/middleware/dynamic-response.ts`, `src/async/offload.ts`, `src/content/compress.ts` — same gzip swap, with a `Buffer.from(Bun.gzipSync(...))` wrapper or strict-Uint8Array view where the consumer expects `Buffer`. Out of scope for one worktree.
- `Bun.deflateSync` / `Bun.inflateSync` adoption is a parallel ticket.
