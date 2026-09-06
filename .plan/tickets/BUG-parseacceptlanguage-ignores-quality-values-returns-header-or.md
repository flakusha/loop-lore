# BUG: parseAcceptLanguage ignores quality values (returns header order, not preference)

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/middleware/i18n.ts:24-34 (parseAcceptLanguage) and detectFromAcceptLanguage:77-100.

Symptom: Locale negotiation does not honor client q-values. Example Accept-Language: en;q=0.1,ja;q=0.9 returns ["en","ja"], so detectFromAcceptLanguage selects "en" even though the client prefers "ja".

Root cause: parseAcceptLanguage splits on commas and strips the ;q=... suffix but never parses or sorts by q. It returns languages in raw header order.

Fix: Parse q per language, sort descending by q (stable), then return. Mirror the q-handling already present in src/transport/negotiation-parsers.ts (but that parser also has its own q=0 bug, see separate ticket).

Note: the docstring example (ja,en-US;q=0.9,en;q=0.8 -> [ja,en-US,en]) only passes because the highest-priority language happens to be first.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed in src/middleware/i18n.ts (q-value parse + sort, q<=0 excluded); verified in this worktree (round-6 batch, 2026-09-06).
