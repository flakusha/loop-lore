# TASK: tighten safeParseInt to strict base-10 contract

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/utils/parse-number.ts (772cc467) documents safeParseInt as base-10 but Number() accepts '0x1A' (26) and '1e3' (1000), so the doc contract is not enforced. Fix options: (a) guard with /^[+-]?\d+$/ before Number(), or (b) relax the JSDoc to 'finite integer in any JS numeric literal form'. Pick one; add regression tests for hex/exponent rejection (or acceptance, per chosen contract). Mirror the decision in src/frontend/utils/parse-number.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
