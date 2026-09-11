<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Effective & Reliable Encryption + Membership-Triggered Key Rotation

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-chat-product-features

## Summary

Make encryption **and compression** effective and reliable across the chat pipeline, and guarantee that the chat key rotates reliably on the next send after any join/leave event. Rotation must be deterministic, idempotent across concurrent membership changes, and not race the next outbound message. Compression must not bypass encryption (compressed payloads stay envelope-encrypted) and must round-trip losslessly for every recipient.

## Acceptance Criteria

- [ ] Every outbound message is encrypted with the current active chat key (no plaintext leak path)
- [ ] Compression is applied (when enabled per chat policy) **before** encryption; the compressed payload is then envelope-encrypted — no plaintext leak in transit or at rest
- [ ] Compression round-trips losslessly for every recipient — decryption + decompression yields the original message bytes for all current members
- [ ] On user join: if previous history is shared with the joiner, the joiner receives the existing keys (so shared history stays decryptable); new messages from this point forward are encrypted under a fresh key. On user leave: from the moment of leaving, all subsequent messages are encrypted under a freshly issued key — the leaver cannot decrypt new messages. Bulk re-encrypt of past messages on user actions is forbidden (only **prospective** key issuance). LLM participants always have access to current keys; chat-access ACL enforces which chats each actor (LLM or human) may read.
- [ ] Rotation is idempotent: overlapping join/leave events collapse to a single re-encrypt
- [ ] In-flight sends observe the post-rotation key — no message is sealed with a stale key after a membership change
- [ ] Rotation history is auditable via `src/crypto/key-rotation/log.ts` and survives restart
- [ ] `src/middleware/idempotency.ts` rejects duplicate rotation triggers inside the same request window
- [ ] `src/crypto/key-rotation/re-encrypt.ts` is exercised for the full re-key path including rollback on partial failure

## Related Tickets / Epics

- epic-chat-product-features
- epic-encryption-workflow
- epic-crypto
- TASK-encryption-wire-message-pipeline
- TASK-stable-stored-chat-key-future
- TASK-resolve-message-content-unit-test-all-encodings

## Files

- `src/crypto/chat-keys.ts`
- `src/crypto/key-distribution.ts`
- `src/crypto/key-rotation/rotate.ts`
- `src/crypto/key-rotation/auto-run.ts`
- `src/crypto/key-rotation/timer.ts`
- `src/crypto/key-rotation/re-encrypt.ts`
- `src/crypto/e2e/group-encrypt-message.ts`
- `src/crypto/pipeline.ts` — encryption + compression pipeline ordering
- `src/crypto/message-content.ts` — compressed+encrypted envelope shape
- `src/middleware/idempotency.ts`

## Open Questions

- Resolved. The join/leave model is **prospective** key issuance, not full re-encrypt. LLM ACL is enforced by the chat-access layer (already in place: actor/participant-based ACL via `chat.allowed_actors`).

