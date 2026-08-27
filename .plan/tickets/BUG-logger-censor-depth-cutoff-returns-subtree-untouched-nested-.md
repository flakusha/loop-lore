# BUG: Logger censor depth cutoff returns subtree untouched — nested secrets bypass denylist

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

`src/logger/censors.ts` `censorValue`: `depth > maxDepth` returns subtree unredacted; secrets nested below `maxDepth` skip all denylist rules.

Minor `censors.ts:6-15` default rules miss `cookie*`, `session*`, `bearer`, `set-cookie`, `auth` variants — add globs.

**Fix**:

- Apply denylist rules even at depth cutoff (redact keys first, then truncate if needed).
- Extend default rules with the missing key patterns.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
