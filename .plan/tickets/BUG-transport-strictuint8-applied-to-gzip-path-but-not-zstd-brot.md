# BUG: transport: strictUint8 applied to gzip path but not zstd/brotli

**Status:** ✅ Done
**Priority:** low
**Effort:** Medium

## Summary

src/transport/compression.ts lines 56-75: strictUint8() was added for Bun.gzipSync type compat on the gzip paths but the zstd and brotli paths still pass raw Buffer. Fix: apply strictUint8 consistently or document why zstd/brotli differ.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

strictUint8 output is now threaded through the zstd and brotli compress+decompress paths (Bun.zstd* casts widened to Uint8Array); gzip already complied.
Landed on `fix-transport-bugs` (transport-domain batch, 2026-09-08).
