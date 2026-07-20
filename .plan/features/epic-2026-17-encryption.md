# Epic 2026-17: Encryption Foundation

**Status:** Not Started (P1)
**Priority:** Medium
**Source:** docs/meta/backlog.md

## Summary

At-rest AES-256-GCM, per-user keys, browser-side key derivation.

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| FEAT-2026-007 | Message archiving (cascade, restore, purge) | Medium | Not Started |
| FEAT-2026-012 | Signed URLs for asset downloads | Low | Not Started |
| TASK-epic17-encryption-e2e-expansion.md | Encryption E2E expansion | Medium | Not Started |
| TASK-encryption-key-management-ui.md | Encryption key management UI | Medium | Not Started |
| TASK-encryption-wire-message-pipeline.md | Wire message pipeline | Medium | Not Started |
| TASK-encryption-key-rotation.md | Key rotation | Medium | Not Started |
| TASK-encryption-group-key-distribution.md | Group key distribution | Medium | Not Started |

## Implementation Phases

### Phase 1: At-Rest Encryption
- [ ] AES-256-GCM encryption for messages
- [ ] Per-user key derivation (Argon2id)
- [ ] Browser-side key derivation

### Phase 2: Chat-Level Keys
- [ ] Chat key derivation
- [ ] Key rotation on user leave
- [ ] Immutability enforcement

### Phase 3: Asset Encryption
- [ ] Signed URLs for downloads
- [ ] Key wrapping per device
- [ ] Asset encryption at rest

### Phase 4: E2E Encryption
- [ ] Private tier implementation
- [ ] Device registration
- [ ] Cross-device sync

## Files

- `src/crypto/at-rest.ts` — At-rest encryption
- `src/crypto/user-keys.ts` — Per-user keys
- `src/crypto/chat-keys.ts` — Chat keys
- `src/crypto/pipeline.ts` — Encryption pipeline
- `src/routes/messages.ts` — Encrypted storage
- `src/assets/controller.ts` — Signed URLs
- `src/frontend/browser.ts` — Browser key derivation
