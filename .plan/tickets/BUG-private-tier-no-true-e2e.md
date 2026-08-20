<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: "Private"/E2E tier is server-mediated symmetric encryption — no true E2E

**Status:** 🟥 Open
**Severity:** High
**Priority:** High
**Epic:** epic-crypto
**Related:** TASK-asymmetric-key-pairs, TASK-encryption-architecture-clarification, TASK-encryption-browser-pre-encrypt

## Summary

No asymmetric or client-held-secret path exists anywhere in `src/`. All message
and asset encryption uses a chat key the server derives from SMK-decryptable
actor keys; the server holds the SMK (in-memory) and every actor key (SMK-
encrypted in DB), so it can decrypt everything. The client "pre-encrypt" flow,
where it exists, is theater: the server hands the same key to the client.

## Evidence

- `src/crypto/smk.ts` — SMK from `SERVER_ENCRYPTION_KEY` env (HKDF), held in memory.
- `src/crypto/chat-keys.ts:99-108` — `deriveChatKeyForChat` decrypts actor keys with SMK, derives the chat key server-side.
- `src/routes/message-encryption.ts:35-79` — returns the raw chat key (base64) to any chat member; no re-auth.
- `src/routes/messages/helpers.ts:153-154` — server decrypts on read (so client pre-encrypt is redundant).
- `src/crypto/e2e/key-bundle.ts` — symmetric AES-GCM wrapping; **unwired** (no route calls it).
- `src/crypto/user-keys.ts` — passphrase (Argon2id+HKDF) key derivation; **unwired** (no route calls it).
- `src/frontend/htmx-encrypt.ts` — receive-side decrypt extension; never registered, no `data-encrypt` emitted — dead code.
- `src/frontend/browser.ts` / `browser-crypto.ts` / `browser-compress.ts` — real AES-GCM/compression, wired into **send** only (`src/frontend/alpine/chat-send.ts`); no receive-decrypt path.

## Impact

The "private = server never sees plaintext" claim in
`docs/frontend/encryption.md` / `docs/spec/encryption-workflow.md` is false.
E2E is mislabeled; users get at-rest encryption with a false expectation of
zero-knowledge privacy against the server/admin.

## Acceptance Criteria

- [ ] Either implement true E2E (asymmetric/ECDH client-held keys, unwrapped client-side), or
- [ ] Rename `private` tier to `at-rest` / document server-holds-keys, and remove all "E2E"/"server never sees plaintext" claims from docs.
- [ ] Remove or wire the dead `e2e/key-bundle.ts`, `user-keys.ts`, `htmx-encrypt.ts` paths.