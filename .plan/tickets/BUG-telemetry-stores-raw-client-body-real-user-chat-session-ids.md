# BUG: Telemetry stores raw client body + real user/chat/session ids

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

`src/routes/telemetry.ts:41` — POST `body.data` persisted verbatim, no shape validation; can carry chat content/identifiers.

`src/telemetry/service.ts:31-40` — rows store raw `user_id`/`chat_id`/`session_id`, violating anonymous-telemetry intent.

Related: `generation/auto-gen/post-store.ts:109-113` persists hallucination `entityName`/`entityType` (model+story output) into telemetry events.

**Fix**:

- Allowlist `data` fields at route (drop unknown keys).
- Hash/truncate `user_id`/`chat_id`/`session_id` at write time (12-char prefix is enough for analytics, kills PII).
- Hash `entityName` for telemetry too.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Fixed in src/telemetry/service.ts (round-7 worktree): user_id/chat_id/session_id hashed at write time via SHA-256 12-char digest (hashId); route already typed/whitelisted. Regression tests updated to assert hashed values. (resolved 2026-09-06)
