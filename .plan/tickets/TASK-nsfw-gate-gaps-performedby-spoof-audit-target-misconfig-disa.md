# TASK: NSFW gate gaps: performedBy spoof, audit target, misconfig disable, PII secret

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/nsfw-moderation/actions.ts:24 performedBy taken from client body not authed caller (spoofable audit); src/generation/hooks/nsfw-hook.ts:150 audit targetUserId set to character not human user (untraceable); src/config/schema-class/hooks.ts:9 enableNsfwHooks false silently disables entire gate; src/generation/auto-gen/content-hooks.ts:107 missing config skips hook (not fail-closed); src/nsfw/pii-redaction.ts:54 NSFW_PII_SECRET defaults to hardcoded dev secret. Fix per .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
