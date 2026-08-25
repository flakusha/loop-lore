# BUG: static asset caching: unconditional Vary + immutable on short-TTL hashed assets

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Location: src/server/static-files.ts:97 (Vary: Accept-Encoding always set) and src/middleware/response-headers.ts:231-237 (augmentImmutable).

Symptoms / issues:
1. respondWithFile sets Vary: Accept-Encoding unconditionally, including for incompressible, non-negotiated assets (png, woff2, etc.). For these single-representation assets the Vary makes shared caches vary on an encoding that is never offered, weakening cacheability.
2. augmentImmutable appends 'immutable' whenever Cache-Control contains 'max-age' AND the path matches the hashed-asset pattern. In dev, static hashed assets are served with max-age=60, producing 'max-age=60, immutable' — a contradictory directive (immutable with a 60s TTL) that can pin stale content in shared caches.

Fix: (1) only set Vary: Accept-Encoding when a compressed variant could actually be served (i.e. for COMPRESSIBLE_EXTS); (2) only append immutable when max-age is at/above the intended long-lived threshold (prod IMMUTABLE_CACHE_MAX_AGE), not for short dev TTLs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
