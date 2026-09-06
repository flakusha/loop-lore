# BUG: dynamic-response Accept-Encoding negotiation uses substring match, ignores q-values

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/middleware/dynamic-response.ts:177,189-206 (compressBody / negotiateEncoding).

Symptom: Compression selection does not respect client preferences. accept.includes("br") matches the substring anywhere and never parses ;q=. A client sending Accept-Encoding: br;q=0 (declining br) or Accept-Encoding: gzip, br with a preference for gzip is still compressed with br whenever config.compressAlgorithm is auto/br.

Root cause: negotiateEncoding uses String.includes("br")/includes("gzip") instead of splitting the header and honoring q-values/order. This is inconsistent with the transport layer (src/transport/negotiation-parsers.ts parseAcceptEncoding), which does split and parse q.

Fix: Reuse parseAcceptEncoding(accept) and pick the highest-q server-supported algorithm; treat q=0 as not-acceptable. Also note parseAcceptEncoding currently does not exclude q=0 (see separate ticket) so fix both together.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed on dev (verified against HEAD a263608e): `src/middleware/dynamic-response.ts` `negotiateEncoding`/`compressBody` now reuse `parseAcceptEncoding` (`src/transport/negotiation-parsers.ts`) — q-value sorted, `q<=0` excluded, no substring matching — consistent with the transport layer. Covered by `negotiation-parsers.test.ts` and `dynamic-response.test.ts`. Residual narrow case: `src/server/static-files.ts` `findCompressedVariant` still splits naively (tracked separately as a FEAT ticket).
