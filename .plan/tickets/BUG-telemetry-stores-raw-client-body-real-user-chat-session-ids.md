# BUG: Telemetry stores raw client body + real user/chat/session ids

**Status:** ⬜ Not Started
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
