<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: "Private"/E2E tier is server-mediated symmetric encryption — no true E2E

**Status:** 🟢 Closed — chose rename path (see below)
**Severity:** High
**Priority:** High
**Epic:** epic-crypto
**Related:** TASK-asymmetric-key-pairs, TASK-encryption-architecture-clarification, TASK-encryption-browser-pre-encrypt

> **2026-08-23 reconciliation note:** the original "Resolution — Chose Rename Path"
> section below was authored against an early plan in which
> `src/crypto/e2e/` (and several other paths) were marked "Dead wiring
> deleted." That never happened — `src/crypto/e2e/` is **active** code
> (Phase D's ratchet + sender-key + group-encrypt-message implementations
> + Phase D's wire envelope used by `at-rest` tier's passthrough). Only
> the rename shipped. See `epic-crypto.md` §"Phase D+" for the audit
> pass that brought the docs/comments in line with the wire-passthrough
> semantics of the current `at-rest` tier.

## Resolution — Chose Rename Path

User chose rename + defer over immediate E2E implementation:

- `private` tier renamed → `at-rest` with honest server-mediated semantics.
- `EncryptionLevel.Private` → `EncryptionLevel.AtRest` in `src/db/enums-core/flags.ts`.
- `src/crypto/at-rest.ts`: `case "at-rest"` now wires the wire-passthrough
  branch (server stores whatever the caller submits and returns it on
  read). This is **not** server-encrypt and **not** true E2E — it is the
  Phase D plumbing for the eventual Phase E client-side E2E wiring.
- All "E2E", "server never sees plaintext", "private = true E2E" claims
  removed from:
  - `docs/frontend/encryption.md`
  - `docs/spec/encryption-workflow.md`
  - `docs/spec/crypto.md`
- **NOT DELETED** (original plan was wrong): `src/crypto/e2e/` is active
  code — Phase D ratchet + sender-key + group-encrypt-message +
  `isE2eOrEncrypted` helper consumed by the at-rest read path. Also not
  deleted: `src/crypto/user-keys.ts`, `src/crypto/user-keys.test.ts`,
  `src/frontend/htmx-encrypt.ts` — these were never present in this
  branch (predecessor commits removed them earlier; the resolution
  text here was speculative).
- `docs/meta/pattern-divergence.md`: deleted-file rows marked (historical record).
- Deferred true E2E work tracked in: `.plan/tickets/TASK-asymmetric-key-pairs-followup.md`.

## Evidence (pre-fix)

- `src/crypto/smk.ts` — SMK from `SERVER_ENCRYPTION_KEY` env (HKDF), held in memory.
- `src/crypto/chat-keys.ts:99-108` — `deriveChatKeyForChat` decrypts actor keys with SMK, derives the chat key server-side.
- `src/routes/message-encryption.ts:35-79` — returns the raw chat key (base64) to any chat member; no re-auth.
- `src/routes/messages/helpers.ts:153-154` — server decrypts on read (so client pre-encrypt is redundant).
- `src/crypto/e2e/key-bundle.ts` — symmetric AES-GCM wrapping; **unwired** (no route calls it).
- `src/crypto/user-keys.ts` — passphrase (Argon2id+HKDF) key derivation; **unwired** (no route calls it).
- `src/frontend/htmx-encrypt.ts` — receive-side decrypt extension; never registered — dead code.

## Impact (pre-fix)

The "private = server never sees plaintext" claim in
`docs/frontend/encryption.md` / `docs/spec/encryption-workflow.md` was false.
E2E was mislabeled; users got at-rest encryption with a false expectation of
zero-knowledge privacy against the server/admin.
