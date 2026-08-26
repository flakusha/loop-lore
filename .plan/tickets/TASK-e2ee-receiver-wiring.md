<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2ee-receiver-wiring: Client-Side E2E — Phase E receiver-side wiring

**Status:** ⬜ Not Started (NEXT slice)
**Priority:** Medium
**Effort:** Medium
**Type:** TASK
**Tags:** crypto, e2e, receiver
**Epic:** epic-crypto
**Parent:** TASK-asymmetric-key-pairs-followup (umbrella)

## Summary

Inbound messages for `at-rest` chats decrypt at the browser layer before they reach the chat UI; the server never observes plaintext. This is the next phase after the shipped Phases Foundation–D.

## Tasks

**Backend (`src/crypto/e2e/`, `src/routes/`):**
- [ ] Wire `src/crypto/e2e/dh-ratchet.ts` decrypt path into the existing message read flow (today the read path returns `e2e_payload` but does not invoke `dhRatchetDecrypt` server-side — server must not, by design, but the route still needs to attach the recipient's stored skipped-keys row so a follow-up browser-side hydration call has what it needs).
- [ ] New route: `GET /api/chats/:id/e2e-session/:recipientActorId` returning the server-side `{ skippedKeys[], lastSeenEphemeralJwk?, lastSeenCounter? }` for a recipient to rebuild local chain state.
- [ ] Per-recipient `e2e_session` rows: extend `e2e_session` shape with a `skipped_keys_summary` JSON column to carry the recipient's seen-chain context without putting crypto material on the server (only counters + ephemeral pubkeys, never chain keys).

**Frontend (`src/frontend/e2e/`, `src/frontend/browser.ts`):**
- [ ] `src/frontend/e2e/decrypt-message.ts` — call `dhRatchetDecrypt` with hydrated chain state + skipped keys; fall back to the existing symmetric decrypt path when payload is non-E2E (semantic-preserving backwards compat).
- [ ] `src/frontend/e2e/hydrate-chain-state.ts` — on message stream open for an `at-rest` chat, fetch `/e2e-session/:recipientId` + actor's local private key from `key-store.ts`, recompute the chain root via `deriveSharedSecret(localPriv, theirEphemeral)`, and produce a usable `DhRatchetState`.
- [ ] Hook into the existing chat-template hydrate path: replace the read-time server-decrypt call (where present) with a client-decrypt step; preserve fallback for `none`/`standard` chats.

**DB (`src/db/migrations/`, `src/db/schema-core.ts`):**
- [ ] New migration `058_e2e_receiver_state.ts`: extend `e2e_session` with `last_seen_ephemeral_jwk`, `last_seen_counter`, `skipped_keys_summary` columns; these are server-stored because they're per-recipient metadata (counters + public ephemerals only — no keys).
- [ ] Regenerate downstream artifacts: `src/db/schema-core.ts`, `src/db/schema.ts`, `src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`, `src/validation/db-schemas.ts`.

## Acceptance criteria

- [ ] Inbound E2E message visible in the chat UI without server-side decrypt.
- [ ] Manual destroy of one actor's localStorage forces a fresh `dhRatchetDecrypt` fail (expected — client-side state is the source of truth).
- [ ] Out-of-order delivery (counter gap) yields correct plaintext via the skipped-key retention path; previously-decoded counter values are still accessible.
- [ ] `bun test src/crypto/ src/frontend/e2e/ src/db/ src/routes/ -t "e2e"` green.
- [ ] `bun run plan:sync` green; `bun run scripts/check-db-schemas.ts` green.

Branch suggestion: `e2e-ratchet-phase-e-receiver-wiring`.

## Dependencies

- Parent hub: `TASK-asymmetric-key-pairs-followup.md`
- **Blocked by:** TASK-e2ee-open-bugs (fix ratchet/base64 bugs against the code this wires).
- Siblings: TASK-e2ee-double-ratchet (follows), TASK-e2ee-crypto-ui.
