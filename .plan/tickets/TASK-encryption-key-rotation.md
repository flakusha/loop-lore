<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Encryption — Key Rotation (Auto + Manual)

**Status:** 🟨 Partial (manual done, auto missing)
**Priority:** Medium
**Effort:** Med
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-group-key-distribution

## Summary

Automatic key rotation based on `KEY_ROTATION_DAYS` config, plus manual rotation trigger. Re-encrypts historical messages asynchronously.

## What Exists

- `src/crypto/chat-keys.ts` — chat key derivation
- `src/crypto/actor-keys.ts` — actor key management
- Spec mentions `KEY_ROTATION_DAYS` config

## Tasks

- [x] `src/crypto/actor-keys.ts` — `rotateActorKey()` (manual rotation)
- [x] `src/routes/key-management.ts` — `POST /api/keys/:id/rotate` endpoint
- [ ] Add `KEY_ROTATION_DAYS` to config schema (default: 90)
- [ ] Add `key_rotated_at` column to `chat_keys` table
- [ ] Create `src/crypto/key-rotation.ts` — rotation logic
- [ ] Auto-rotation: cron/timer checks for expired keys
- [ ] Re-encryption pipeline: async batch re-encrypt old messages
- [ ] Rotation notification: inform participants of key change
- [ ] Add tests: auto-rotation trigger, manual rotation, re-encryption

## Files to Create

- `src/crypto/key-rotation.ts` — rotation logic
- `src/crypto/key-rotation.test.ts` — tests

## Files to Modify

- `src/config/schema.ts` — add KEY_ROTATION_DAYS
- `src/db/schema-chats.ts` — add key_rotated_at
- `src/routes/chats.ts` — manual rotation endpoint
- `src/crypto/chat-keys.ts` — rotation support

## Risk

Med — async re-encryption performance, concurrent access during rotation.

## Linked Epics

- `epic-crypto.md`
