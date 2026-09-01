# BUG: hashReporterId uses hardcoded default secret in production — breaks PII pseudonymous projection

**Status:** ✅ Done (worktree fix-nsfw-hashreporterid-default-secret, pending commit)
**Priority:** high
**Effort:** Small
**Epic:** epic-nsfw-moderation-priority

## Summary

flags.ts:196 hashReporterId() falls back to the hardcoded string 'loop-lore-nsfw-default-do-not-use-in-prod' when neither NSFW_FLAG_REPORTER_HASH_SECRET nor NSFW_MODERATION_HMAC_SECRET is set. This was introduced alongside the PII hardening in pii-redaction.ts (which correctly throws in production), but hashReporterId was not given the same production gate. In production without the env var, an attacker who knows the default can reverse the rh_ hash and correlate flags back to individual reporters, defeating the redaction in toQueueView. Fix: add a resolveReporterHashSecret() that throws in production (same pattern as resolveNsfwPiiSecret in pii-redaction.ts:55-76).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
