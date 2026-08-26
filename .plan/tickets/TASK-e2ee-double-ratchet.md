<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2ee-double-ratchet: Client-Side E2E — Phase F Signal-grade double ratchet

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Large
**Type:** TASK
**Tags:** crypto, e2e, ratchet, forward-secrecy
**Epic:** epic-crypto
**Parent:** TASK-asymmetric-key-pairs-followup (umbrella)

## Summary

Replace the current ECDH-ephemeral approach with a full Signal-grade double ratchet: X3DH initial key agreement, unbounded skipped-key retention, and asynchronous receiver state persistence. Tracked for forward visibility; not blocked on anything but Phase E.

## Tasks

- [ ] **X3DH initial key agreement** — signed prekeys + one-time prekeys + DH ratchet replacing today's single ephemeral-ECDH handshake.
- [ ] **Asynchronous initial-key delivery** — server stores the signed prekey bundle; receiver fetches on first contact.
- [ ] **Unbounded skipped-key retention** — remove today's `maxSkip` cap while keeping storage bounded in practice.
- [ ] **Asynchronous ratchet state persistence** — IndexedDB-wrapped-key store (today localStorage JWK via `src/frontend/e2e/key-store.ts`); the documented hardening follow-up from the Foundation slice.
- [ ] Session-key strategy sign-off: per-message keys vs per-session re-keying (open question from the parent's design phase).
- [ ] Tests: X3DH handshake, out-of-order delivery across large counter gaps, state restore after reload, forward secrecy window assertions.
- [ ] Migration plan from Phase E session shape (`e2e_sessions` + skipped-keys summary) to double-ratchet state without breaking `at-rest` chats mid-history.

## Risk

**High.** Cryptographic protocol design, forward secrecy implementation, browser compatibility, performance. Requires external security audit before production.

## Dependencies

- Parent hub: `TASK-asymmetric-key-pairs-followup.md`
- **After:** TASK-e2ee-receiver-wiring (Phase E) and TASK-e2ee-open-bugs.
- Siblings: TASK-e2ee-crypto-ui (independent UI track, shares tier vocabulary).
