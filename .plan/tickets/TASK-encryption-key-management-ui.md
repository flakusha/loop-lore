# TASK: Encryption — Key Management UI

**Status:** 🟨 Partial (routes done, UI pending)
**Priority:** High
**Effort:** Med
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-wire-message-pipeline

## Summary

Build key management UI at `/settings/keys`. Users can view, generate, rotate, revoke, and export their encryption keys.

## What Exists

- `src/crypto/actor-keys.ts` — key CRUD (server-side)
- `src/crypto/smk.ts` — SMK for key encryption
- `docs/frontend/encryption.md` — full UI spec

## UI Spec (from docs/frontend/encryption.md)

| Action         | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| View keys      | List all owned keys with name, type, created, status        |
| Request key    | Download/copy primary key (re-auth required)                |
| Generate key   | Create additional named key                                 |
| Rotate key     | New primary, old → expired. Optionally re-encrypt history   |
| Revoke key     | Irreversible. Confirm with typed "REVOKE"                   |
| Purge key      | Delete key record. Messages become permanently inaccessible |
| View history   | Per-key message list with date/chat/role filters            |
| Export history | Download as JSON, Markdown, or plain text                   |

## Tasks

- [x] `src/routes/key-management.ts` — key CRUD endpoints (list, generate, rotate, revoke)
- [x] `src/routes/message-encryption.ts` — GET chat encryption key
- [ ] Create `src/frontend/alpine/key-management.ts` — Alpine.js component
- [ ] Create `src/components/settings/key-management.html` — UI template
- [ ] Wire into settings page navigation
- [ ] Add re-auth gate for sensitive operations (rotate, revoke, purge)
- [ ] Add confirmation dialogs for destructive actions

## Files Created

- `src/routes/key-management.ts` — key management API ✅
- `src/routes/message-encryption.ts` — chat key endpoint ✅

## Files Still Needed

- `src/frontend/alpine/key-management.ts` — Alpine component
- `src/components/settings/key-management.html` — UI template

## Files to Modify

- `src/views/settings.html` — add keys tab
- `src/frontend/alpine/settings.ts` — wire key management

## Risk

Med — UI complexity, re-auth flow, destructive action safeguards.

## Linked Epics

- `epic-crypto.md`
