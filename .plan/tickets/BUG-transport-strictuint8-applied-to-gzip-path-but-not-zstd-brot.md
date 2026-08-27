# BUG: transport: strictUint8 applied to gzip path but not zstd/brotli

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/transport/compression.ts lines 56-75: strictUint8() was added for Bun.gzipSync type compat on the gzip paths but the zstd and brotli paths still pass raw Buffer. Fix: apply strictUint8 consistently or document why zstd/brotli differ.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
