<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Encryption tier (`encryption_level`) is never enforced; default `"public"` is out-of-enum

**Status:** 🟢 Closed — fixed by crypto-tier-foundation branch (commits f06900a0 + 9c800c52)
**Severity:** Critical
**Priority:** High
**Epic:** epic-crypto
**Related:** epic-encryption-workflow

## Summary

The three-tier encryption model (`public` / `standard` / `private`) is not
enforced anywhere. Message write/read encrypt/decrypt purely on the
server-global `isEncryptionEnabled()` (SMK presence), never reading
`chats.encryption_level`. Concurrently, `chats.encryption_level` defaults to
`"public"` — a value that does not exist in the `EncryptionLevel` enum
(`none | standard | private`).

## Root Causes

1. **Out-of-enum default.** `src/db/migrations/parts/004_chats_actors.ts:21`
   sets `encryption_level ... NOT NULL DEFAULT 'public'`, but
   `src/db/enums-core/flags.ts:73-78` defines `EncryptionLevel =
   { None: "none", Standard: "standard", Private: "private" }`. `"public"` is
   not a member.
2. **Column never set at creation.** `src/chat/service/crud/create.ts` and
   `src/routes/chats/create.ts` never assign `encryption_level`, so every new
   chat inherits the invalid `"public"` default.
3. **Pipeline ignores the tier.** Write path (`src/routes/messages/post.ts:48`,
   `command.ts:114`, `reply.ts:70`, `update.ts:109`, `src/generation/*/persist.ts`,
   `src/story/game-master/narration.ts`) gates encryption on
   `isEncryptionEnabled()` only. Read path
   (`src/routes/messages/helpers.ts:136-159`) decrypts on `key_id` presence only.
4. **Tier-aware layer is dead code.** `src/crypto/at-rest.ts`
   (`encryptAtRest` / `decryptAtRest` / `needsEncryption` /
   `getChatEncryptionLevel`) is exported and unit-tested but never called by any
   route (grep: zero non-crypto call sites).

## Impact

- Every chat (including `public` and the invalid-default `"public"`) is
  encrypted identically whenever `SERVER_ENCRYPTION_KEY` is set. Public chats
  are not plaintext; private chats are not E2E.
- The `private` tier's `throw` in `at-rest.ts` is unreachable, so a `private`
  chat silently behaves like `standard`.

- [x] `encryption_level` default reconciled to valid enum value (`none`).
- [x] `createChat` sets `encryption_level` explicitly.
- [x] Message write/read branches on tier; `at-rest.ts` is the wired entry point.
- [x] Test proving `none` chats store plaintext, `standard` server-encrypts, `at-rest` mirrors standard (honest model).