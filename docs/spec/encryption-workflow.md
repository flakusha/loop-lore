<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Encryption Workflow Specification

Status: Core pipeline built and wired — `src/crypto/{pipeline,smk,actor-keys,chat-keys,key-distribution,at-rest}.ts`. See `.plan/epics/epic-encryption-workflow.md` and `.plan/epics/epic-crypto.md`.

## Implemented

- Key hierarchy: `SERVER_ENCRYPTION_KEY` (256-bit hex env) → HKDF-SHA256 → SMK (AES-256-GCM, in-memory, `smk.ts`) → SMK-encrypted per-actor keys in `actor_keys` (Argon2id, `actor-keys.ts`) → per-chat keys via HKDF over participant raw keys (`chat-keys.ts`).
- Tiers via `chats.encryption_level`: `none` (plaintext), `standard` (server-mediated AES-256-GCM chat keys), `at-rest` (same server-mediated mechanism; **not** true E2E — previously misnamed `private`, see `BUG-private-tier-no-true-e2e.md`).
- Pipeline (`pipeline.ts`): compress (gzip→brotli→zstd if ≥ threshold, default 128 B) → AES-256-GCM (12-byte nonce) → JSON payload `{ enc, nonce, algo, comp, compAlgo, key_id }`; read path reverses. Helpers `isEncryptedPayload`, `extractKeyIdFromPayload`.
- At-rest tier wrapper (`at-rest.ts`): `encryptAtRest`/`decryptAtRest`/`needsEncryption`/`getChatEncryptionLevel`.
- Key distribution (`key-distribution.ts`): wrap chat key on join, rotate on leave, `resolveChatKey`.
- Route integration: messages write/read/edit paths (`src/routes/messages.ts`), key management routes (`/api/keys`, generate/rotate/revoke in `src/routes/key-management.ts`), chat key endpoint (`GET /api/chats/:id/encryption-key`).
- Storage: encrypted JSON in `messages.content` + `messages.key_id`; plaintext when `none` or dev mode (no SMK → `content_encoding` tracks compression, no wrapper).
- Failure modes: missing `SERVER_ENCRYPTION_KEY` + `ENCRYPTION_REQUIRED=true` refuses startup; encrypt failure = 500 no partial write; auth-tag mismatch = throw (tamper); missing/revoked key = 403.
- Env: `SERVER_ENCRYPTION_KEY`, `ENCRYPTION_REQUIRED`, `COMPRESS_THRESHOLD=128`, `COMPRESS_ALGORITHM=gzip`. (`KEY_ROTATION_DAYS` documented but unimplemented.)

## Not implemented / aspirational

- Auto-key rotation, asset/world encryption, time-based access expiry, asymmetric key pairs (true E2E — `TASK-asymmetric-key-pairs-followup.md`), browser pre-encrypt integration, key-management UI, crypto test isolation (~20 failures in full suite).

## Epics

- `.plan/epics/epic-encryption-workflow.md`
- `.plan/epics/epic-crypto.md`

## See also

`docs/frontend/encryption.md` (UX + threat model), `docs/spec/crypto.md`.
