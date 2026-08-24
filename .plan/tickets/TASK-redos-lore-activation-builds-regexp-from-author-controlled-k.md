# TASK: ReDoS: lore activation builds RegExp from author-controlled key

**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Medium

## Summary

src/assistant/prompt/sections/lore-activation.ts:45 does new RegExp(key,'i') from lore keys (key_type regex) which are author/imported-character-card controlled, then runs .test on scanned conversation per message. No backtracking guard; malicious card freezes every chat turn. Fix: validate with safe-regex/RE2, cap length, reject nested quantifiers, run in worker with timeout. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
