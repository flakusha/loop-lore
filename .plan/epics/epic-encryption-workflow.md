<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Encryption Workflow

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Rotation + asset encryption shipped (reconciled 2026-10-02); open gaps: rotation notifications, key-management re-auth gate, Phase 2d algorithm extensibility, Phases 3–4
**Priority:** Medium
**Spec:** `docs/spec/encryption-workflow.md`

## Summary

Full encryption lifecycle: compress→encrypt→decrypt→decompress pipeline, tier-aware storage, key management, and distribution. Core pipeline and routes built; remaining work is auto-rotation, asset encryption, and UI.

## What's Built

- `src/crypto/pipeline.ts` — `compressThenEncrypt` / `decryptThenDecompress` (now supports extensible algorithms)
- `src/crypto/at-rest.ts` — tier-aware encrypt/decrypt wrapper
- `src/crypto/smk.ts` — SMK initialization
- `src/crypto/actor-keys.ts` — actor key CRUD
- `src/crypto/chat-keys.ts` — chat key derivation
- `src/crypto/key-distribution.ts` — join/leave key distribution
- `src/crypto/user-keys.ts` — user key management
- `src/crypto/e2e/key-bundle.ts` — symmetric key wrapping
- `src/crypto/byok.ts` — API key encryption
- `src/routes/messages.ts` — encrypt on write, decrypt on read
- `src/routes/key-management.ts` — key CRUD endpoints
- `src/routes/message-encryption.ts` — chat key endpoint
- `src/routes/auth.ts` — actor key creation on login

## Algorithm Extensibility

The encryption workflow now supports future additions of new algorithms through:

- **Algorithm Registry**: Central registry for algorithm implementations
- **Factory Pattern**: `createEncryptor(algorithm)` and `createDecryptor(algorithm)`
- **Configuration-Driven**: Algorithm selection via config
- **Plugin Hooks**: Runtime algorithm registration via plugins

## Remaining Tasks

### Phase 2a: Auto-Key Rotation (shipped 2026-10-02 reconcile, except notifications)

- [x] `KEY_ROTATION_DAYS` config option — shipped (`src/config/sections/encryption.ts`, wired in `src/config/schema-class/env-map.ts`, default 90)
- [x] `src/crypto/key-rotation/` rotation module — shipped (`auto-run.ts`, `timer.ts`, `rotate.ts`, `find-expired.ts`, `re-encrypt.ts`, `rotation-history.ts`)
- [x] Timer/cron-based auto-rotation trigger — shipped (`startAutoRotationTimer` in `src/crypto/key-rotation/timer.ts`, pinned by `timer.test.ts`)
- [x] Batch re-encryption pipeline — superseded: post-054 stable per-chat keys removed the re-encrypt requirement (`src/crypto/key-rotation/rotate.ts`, `messagesReEncrypted` always 0 per `rotate.test.ts`); explicit re-encrypt retained for join/leave (`re-encrypt.ts`, incl. `reEncryptChatAssets` with per-asset HKDF subkeys)
- [ ] Rotation notification to participants — still open (no notify/broadcast path in `src/crypto/key-rotation/` or `key-distribution.ts`)

### Phase 2b: Asset Encryption (shipped 2026-10-02 reconcile)

- [x] Wire encryption into asset service — shipped (`encryptAssetBlob` in `src/assets/service/create.ts`, decrypt in `src/assets/service/read.ts`, serve path in `src/assets/serve-raw.ts`)
- [x] Add `encryption_tier` + `encrypted_key_id` columns to `assets` table — shipped (written in `src/assets/service/create.ts`, read in `src/assets/service/read.ts`)
- [x] Key derivation: parent key → asset key (HKDF) — shipped (`deriveAssetSubkey` in `src/crypto/asset-encryption.ts`, isolation pinned by `src/crypto/asset-encryption.test.ts`)
- [x] Tests: encrypt on upload, decrypt on download — shipped (`src/assets/service/create.coverage.test.ts`, `src/assets/service/read.test.ts`)

### Phase 2c: Key Management UI (routes + component shipped 2026-10-02 reconcile; re-auth gate open)

- [x] `src/frontend/alpine/key-management.ts` — Alpine.js component — shipped (imported in `src/frontend/alpine/index.ts`, keys tab in `src/views/settings.html`)
- [x] Key-management UI template — shipped as keys tab in `src/views/settings.html` (`src/components/settings/key-management.html` does not exist)
- [x] Wire into settings keys surface — shipped (keys tab + `keyManagementRoutes` in `src/routes/key-management.ts`)
- [ ] Re-auth gate for sensitive operations — still open (no re-auth/confirm gate found in `src/routes/key-management.ts`)

### Phase 2d: Algorithm Extensibility

- [ ] `TASK-crypto-algorithm-factory.md` — implement algorithm factory
- [ ] `TASK-crypto-plugin-hooks.md` — add crypto plugin hooks
- [ ] `TASK-crypto-config-algorithm.md` — add algorithm configuration
- [ ] `TASK-encryption-asset-encryption-update.md` — update asset encryption for extensible algorithms
- [ ] `TASK-encryption-backward-compatibility.md` — implement backward compatibility
- [ ] `TASK-crypto-algorithm-tests.md` — create comprehensive tests

### Phase 3: Time-Based Access

- [ ] `access_duration_days` column on `chats`
- [ ] `expires_at` / `revoked_at` columns on `chat_participants`
- [ ] Expiry check on key retrieval
- [ ] Admin endpoint: grant/revoke/extend access

### Phase 4: Advanced Encryption

- [ ] World/Location encryption (schema + key derivation chain)
- [ ] Asymmetric key pairs for true E2E
- [ ] Browser pre-encrypt integration (feature detection + fallbacks)
- [ ] Anonymous chat mode

## Related Epics

- `epic-crypto.md` — parent encryption epic
- `epic-frontend-encryption.md` — frontend encryption UI
- `epic-chat-lifecycle-moderation.md` — privacy/moderation coexistence

## Related Tickets

- `TASK-epic17-encryption-e2e-expansion.md` — detailed status tracker
- `TASK-encryption-wire-message-pipeline.md` — ✅ DONE
- `TASK-encryption-group-key-distribution.md` — ✅ DONE
- `TASK-encryption-key-management-ui.md` — routes done, UI pending
- `TASK-encryption-key-rotation.md` — manual done, auto missing
- `TASK-encryption-asset-encryption.md` — ⬜ Not started
- `TASK-encryption-access-management.md` — ⬜ Not started
- `TASK-encryption-browser-pre-encrypt.md` — ⬜ Not started
- `TASK-fix-crypto-isolation.md` — was misdiagnosed; root cause was missed migration context for `keyRotationDays` test fixtures. See ticket status.
- `TASK-asymmetric-key-pairs-followup.md` — Phases A–D shipped on dev `10b203b4`; Phase E (receiver-side wiring) next.

## Known Bugs & Reconciliation (2026-08)

- Encryption tier (`chats.encryption_level`) is NOT enforced by the message
  pipeline; `public`/`standard`/`private` are indistinguishable at rest.
  See `BUG-encryption-tier-not-enforced.md`.
- Auto-key-rotation IS built (`src/crypto/key-rotation/`) but re-encrypt is a
  silent no-op (orphans history) and is disabled by config drift. See
  `BUG-key-rotation-noop-orphans-history.md`, `BUG-auto-rotation-config-drift.md`.
  Both BUGs Closed — fixes verified on dev (commit `10f1418bf` 2026-08-21:
  rotation history-preservation + auto-rotation timer tests; post-054 stable
  per-chat keys removed the re-encrypt requirement; `KEY_ROTATION_DAYS` wired
  in schema-class/env-map).
- Asset encryption IS wired (upload/download) — Phase 2b below is stale on that
  point; the open gap is the HKDF asset subkey, not the wiring.
- Group key distribution loses history on join/leave. See
  `BUG-chat-key-history-loss-join-leave.md`.
- Phase B/C/D crypto shipping surfaced 4 latent bugs — see
  `epic-crypto.md` §"Open bugs against Phase B/C/D code" (2026-08-23)
  for the cross-referenced list.
