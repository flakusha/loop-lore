# BUG: transport negotiation parsers do not exclude q=0 or validate q-values

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/transport/negotiation-parsers.ts:24 (parseAcceptProtocols) and :50 (parseAcceptEncoding).

Symptom: Per RFC 7231, q=0 means 'not acceptable', but both parsers accept q=0 entries and feed them to negotiate(). negotiate() (src/transport/negotiation.ts:69-85) selects the highest-q server-supported candidate, so a q=0 protocol/encoding the server supports can still be chosen when no higher-q match exists. Also invalid q (e.g. q=abc -> NaN, or q>1) is neither clamped nor rejected, producing unstable sorting.

Fix: Drop entries with q <= 0; clamp q to [0,1]; coerce unparseable q to a default and guard against NaN. Apply the same q-exclusion fix in parseAcceptLanguage (separate ticket) and dynamic-response negotiateEncoding (separate ticket) for consistency.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
