# FEAT: static file server honors Accept-Encoding q-values and wildcard

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small

## Summary

Location: src/server/static-files.ts findCompressedVariant.

Symptom: variant selection splits Accept-Encoding on commas and exact-matches 'br'/'zstd'/'gzip'. Clients sending q-values ('gzip;q=0.5, br;q=0.8') or '*' get identity encoding even though precompressed variants exist. Sibling issue to existing ticket BUG-dynamic-response-accept-encoding-negotiation-uses-substring- (middleware layer); this is the static-file layer with its own parser.

Fix: reuse src/transport/negotiation-parsers.ts parseAcceptEncoding (already q-aware) in both layers; treat q=0 as unacceptable; pick highest-q supported variant; honor * per RFC 9110 12.5.3. Also set Vary: Accept-Encoding unconditionally for compressible paths (today it is only set when THIS request's header happens to match a variant, which can poison shared caches).

Acceptance:
- [ ] unit tests: q-ordering, q=0 exclusion, wildcard
- [ ] curl verification against dev server for br/zstd/gzip/identity
- [ ] shared helper used by dynamic-response middleware too

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
