<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: translation route silent catch ships undecryptable ciphertext to external MT and persists it

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Translation route silent catch ships undecryptable (encrypted) message content to external translation providers and persists it as a plaintext variant.

**Files:**

- src/routes/messages/translations.ts:178-197 (catch at 186-188)

**Evidence:**

- POST `/messages/:id/translations` wraps `resolveMessageContent` in `catch { plaintext = message.content as string; }` (lines 186-188), then passes `plaintext` to `translateMessageToLocale` → external MT provider (DeepL/LibreTranslate/Google). When at-rest decryption fails (rotated/missing key), the raw stored ciphertext/compressed blob leaves the trust boundary and is also persisted as the variant's `content_plaintext` (review-core.md F-3).
- Every sibling path degrades safely instead: messages/read.ts:157,228 and translations.ts:143,219 substitute `[Encrypted — unable to decrypt]` or return a typed error. This is the only silent catch in the week's changed backend files (banned pattern).

**Fix:**

Replace the silent catch with the sibling degrade path (typed error, `[Encrypted — unable to decrypt]`); never pass raw stored content to MT.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-core.md F-3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 61d78b5 (registry tip: 17b60f539 Konstantin Fedotov Close issue)
