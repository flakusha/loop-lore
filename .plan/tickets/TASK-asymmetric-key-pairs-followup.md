<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement True Client-Side E2E for at-rest+ Tier (4-phase delivery)

**Status:** 🟡 Phases A–D shipped (commit `10b203b4` on dev); Phase E next
**Priority:** Medium
**Effort:** Large
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-architecture-clarification (Phase G only — see below)
**Git issue:** 5d9636b (open — re-open on next phase)
**Branch:** (next) e2e-ratchet-phase-e-receiver-wiring

## Summary

Implement genuine end-to-end encryption for the `at-rest` encryption tier where the server
cannot decrypt message content. Server holds no client-held secrets. All current encryption
is server-mediated symmetric (SMK → actor keys → chat keys); the server can decrypt everything.

This is a **deferred** ticket, split off from `BUG-private-tier-no-true-e2e.md` (now closed)
which chose the rename-now/defer-E2E path.

## Context

`BUG-private-tier-no-true-e2e.md` — **Closed**. Documents the evidence that current
`at-rest` tier is server-mediated and not true E2E.

`TASK-asymmetric-key-pairs.md` — **Existing ticket** (partially overlaps; design
reference). Defines the asymmetric key protocol (ECDSA/X25519, forward secrecy).

`TASK-encryption-browser-pre-encrypt.md` — **Existing ticket**. Browser encrypt on send
and decrypt on receive; partially built but receive path missing.

## Relationship to Existing Tickets

| Ticket | Scope | This Ticket vs That |
|--------|-------|---------------------|
| `TASK-asymmetric-key-pairs.md` | Full asymmetric key protocol | Reference; this ticket focuses on the minimum viable true E2E path |
| `TASK-encryption-browser-pre-encrypt.md` | Browser encrypt/decrypt wiring | This ticket covers the E2E key distribution and key escrow, not the UI wiring |

## Scope

### Minimum Viable True E2E

1. **ECDH key pairs per actor** — ECDH P-256 or X25519 key pairs generated client-side.
   Private key stored in the client's key store (IndexedDB or file-based), never sent to server.

2. **Public key distribution** — Server stores and distributes actor public keys. New joiners
   receive all current participants' public keys.

3. **ECDH key agreement** — When two actors need to communicate, they perform ECDH to
   derive a shared symmetric key. No server involvement in the key agreement.

4. **Server-side key escrow (optional, for key recovery)** — Separate mechanism from E2E.
   If key escrow is desired, implement as an opt-in feature (separate from core E2E flow).

5. **Client-side encrypt + decrypt** — Browser encrypts before sending; server stores the
   ciphertext blob without ever seeing plaintext. On receive, browser decrypts client-side.
   Server cannot decrypt, index, search, or moderate message content in E2E chats.

6. **Forward secrecy** — Session key rotation. Compromised session key does not expose
   historical messages.

### Out of Scope for This Ticket

- Key management UI (belong in `TASK-encryption-browser-pre-encrypt.md`)
- Asset encryption E2E (separate work item)
- LLM integration with E2E chats (server cannot see plaintext — LLM must run client-side or via secure enclave)

## Design Direction

```
Actor A (client)                            Actor B (client)
    |                                              |
    |-- ECDH: generate ephemeral key -------------->|
    |<--------- ECDH: generate ephemeral key -------|
    |                                              |
    ECDH shared secret = S                        ECDH shared secret = S
    HKDF(S) → AES-256-GCM session key             HKDF(S) → AES-256-GCM session key
    |                                              |
    |-- encrypt(plaintext, session_key) ──────────>|
    |     (server stores blob, cannot decrypt)     |
    |                                              |
```

Server roles (E2E path):
- Store/relay encrypted blobs
- Distribute public keys
- Notify participants of key rotation
- **Never holds session keys or plaintext**

## Key Open Questions

- **Forward secrecy**: per-message keys vs per-session keys? Re-keying strategy?
- **Group chats**: pairwise ECDH per participant pair (O(n²)) vs sender-key ratchet?
- **Key revocation / recovery**: if a device is lost, how does the user recover? (Key escrow opt-in? Social recovery? No recovery? — needs decision before implementation)
- **LLM integration**: For E2E chats, server cannot decrypt for generation. Options:
  - Client-side LLM inference (local model)
  - Secure enclave / confidential computing (server-side but trusted execution environment)
  - E2E + server-side deniability (E2E for storage, plaintext for generation with user consent)

## Tasks

- [ ] Resolve key open questions (forward secrecy strategy, group chat key management, key recovery, LLM integration)
- [ ] Architecture clarification ticket (`TASK-encryption-architecture-clarification.md`)
- [x] Implement ECDH key pair generation (`src/crypto/e2e/key-pairs.ts`)
- [x] Public key registration and distribution (`src/crypto/e2e/server-registry.ts` + `actor_e2e_pubkeys` table)
- [x] ECDH key agreement (shared secret derivation via `deriveSharedSecret` + HKDF-AES-256-GCM session key)
- [ ] Session key ratchet (forward secrecy)
- [ ] Browser integration: key storage, encrypt on send, decrypt on receive
- [ ] Group chat: sender-key ratchet or pairwise ECDH
- [ ] Tests: key generation, agreement, encrypt/decrypt, forward secrecy, group chat


## Files to Create

TBD after architecture clarification.

## Files to Modify

- `src/db/schema-core.ts` — public key storage, session key state
- `src/db/migrations/` — new migration
- `src/crypto/` — new E2E module (or reuse/expand former `e2e/` directory)
- `src/frontend/browser.ts` / new E2E module

## Risk

**High.** Cryptographic protocol design, forward secrecy implementation, browser compatibility, performance. Requires external security audit before production.

## References

- `BUG-private-tier-no-true-e2e.md` — closed bug that spawned this ticket
- `TASK-asymmetric-key-pairs.md` — existing ticket (design reference)
- `TASK-encryption-browser-pre-encrypt.md` — browser wiring ticket
- `docs/frontend/encryption.md` — current (honest) tier documentation
- `docs/spec/encryption-workflow.md` — current workflow spec

## Verification Notes (2026-08-22)

First slice landed in commits `f534c4d3` + `a2f90efa` + `1108b063` (branch
`asymmetric-e2e`) and was merged to dev as commit `17410ce1`. Branch
`asymmetric-e2e` was removed after finalization.


- **Migration:** `src/db/migrations/055_e2e_pubkeys.ts` — `actor_e2e_pubkeys`
  table with `actor_id`, `public_key_jwk` (text), `algorithm` (default
  `ECDH-P256`), `created_at`, `expires_at`, `revoked_at`. Soft-revoke
  pattern (revoked rows kept for audit). Uniqueness-across-rotations is
  enforced in application code (`registerPublicKey` soft-revokes the old
  row before insert).
- **Crypto core:** `src/crypto/e2e/key-pairs.ts` — ECDH P-256 keypair gen,
  JWK import/export, `deriveSharedSecret` (ECDH → HKDF-SHA256 →
  AES-256-GCM session key). All exported CryptoKey handles are
  non-extractable at the public-import + session-key stages.
- **Frontend store:** `src/frontend/e2e/key-store.ts` — `localStorage`-backed
  per-actor private-key JWK persistence. v1 accepts the same threat
  surface as other persisted secrets (session token, theme prefs).
  IndexedDB-with-wrapped-key is the documented hardening follow-up.
- **Server registry:** `src/crypto/e2e/server-registry.ts` — register,
  get-active, list-active, revoke operations.
- **HTTP:** `src/routes/actor-e2e-pubkeys.ts` — `GET/PUT/DELETE
  /api/actors/:id/e2e-public-key`. Owner-only writes, any-auth reads.
- **Tests:** 9 unit tests (key-pairs) + 12 integration tests (server
  registry, in-memory SQLite with full migration set). All pass.

**Subsequent phases (4-phase plan; see `epic-crypto.md` §"Client-Side E2E — 4-Phase Plan"):**

- **Phase A (NEXT):** ratchet primitive + 1:1 E2E message exchange.
  Branch `e2e-ratchet-phase-a`. See acceptance criteria below.
- Phase B: chain advancement + forward secrecy.
- Phase C: group chat (sender-key distribution).
- Phase D: sender-side integration with the chat route + at-rest tier
  enum relaxation.

**Closed-by:** none yet — ticket remains open. Foundation shipped;
each subsequent phase closes a slice once shipped.

## Phase A — Acceptance Criteria

- `src/crypto/e2e/ratchet.ts` exposes `nextSessionKey(chainKey)` returning
  `{ chainKey, messageKey }`.
- `src/frontend/e2e/encrypt-message.ts` fetches recipient's pubkey, ECDH-
  derives a session key, encrypts plaintext, emits
  `{ciphertext, nonce, ephemeralPubKey, chainKey}`.
- `src/frontend/e2e/decrypt-message.ts` decrypts the same tuple.
- Migration `056_e2e_payload`: `messages.e2e_payload` (TEXT, nullable),
  `messages.e2e_session_id` (TEXT, nullable), `e2e_sessions` table.
- `src/crypto/e2e/e2e-session.ts` server-side session lookup (read-only).
- Unit tests for ratchet (single message → next chain step), encrypt/
  decrypt roundtrip, tamper detection (auth-tag mismatch throws).
- Integration test: Alice encrypts → store in DB → Bob fetches via the
  server → decrypts with his stored private key + the message's
  `ephemeralPubKey`/`chainKey`.
- `bun run typecheck` + `bun test src/crypto/e2e/ src/frontend/e2e/`
  green.
- `bun run plan:sync` green.

## Phase Status (post-Phase-D, 2026-08-23)

- [x] **Foundation** (commit `17410ce1`) — ECDH keypair gen + actor pubkey registry + session key derive.
- [x] **Phase A** (commit `10b203b4`) — ratchet primitive + 1:1 encrypt/decrypt.
- [x] **Phase B** (commit `10b203b4`) — per-message ECDH forward-secrecy window + skipped-key retention.
- [x] **Phase C** (commit `10b203b4`) — group sender-key + per-recipient ECDH wrap + tamper-detected unwrap.
- [x] **Phase D** (commit `10b203b4`) — tier rename `private → at-rest` + 057 migration + integration tests green.
- [ ] **Phase E** (NEXT) — receiver-side wiring: server-issued ephemeral pubkey round trip
       on inbound messages, chain-state hydration, on-receive decrypt at the browser layer.
- [ ] **Phase F** — full Signal-grade double ratchet (X3DH initial key agreement,
       unbounded skipped-key retention, async receiver state persistence).
- [ ] **Phase G** — UI affordances: per-chat tier dropdown, key-recovery flow,
       LLM-with-E2E consent UX. Blocked on `TASK-encryption-architecture-clarification`.

### Open bugs against the shipped code (must resolve before Phase E starts)

- `BUG-dhratchetdecrypt-mutates-opts-state-aliasing-hazard.md` —
  `dhRatchetDecrypt` continuation branch aliases caller's state. Latent bug if a
  caller retains the input. Fix: clone `state` at the top of the function.
  See `src/crypto/e2e/dh-ratchet.ts:156`.
- `BUG-initdhratchetopts-theirinitialpub-declared-but-never-read.md` —
  `initDhRatchet` accepts `theirInitialPub` but never uses it. Misleading API;
  remove the dead param + callsites (option A from the ticket) — option B (use
  it to seed the DH) would break the existing test contract that asserts
  `sendingChainKey === receivingChainKey` derived from root.
  See `src/crypto/e2e/dh-ratchet.ts:42-79`.
- `BUG-base64-tobase64-coerces-undefined-to-0-via-bytes-i-0.md` —
  `toBase64` reads `bytes[i] ?? 0`; the `?? 0` is dead for `Uint8Array` and
  silently masks caller bugs. Replace with `bytes[i]!`. Affects `dh-ratchet.ts`.
  See `src/utils/base64.ts:18`.
- `BUG-hot-reload-test-ts-asserts-trivially-true-on-emfile-enoent-c.md` —
  pre-existing config-infra coverage gap, unrelated to crypto. Defer to backlog.

## Phase E — Receiver-side wiring (NEXT slice)

**Goal:** Inbound messages for `at-rest` chats decrypt at the browser layer
before they reach the chat UI; the server never observes plaintext.

**Backend (`src/crypto/e2e/`, `src/routes/`):**
- Wire `src/crypto/e2e/dh-ratchet.ts` decrypt path into the existing message
  read flow (today the read path returns `e2e_payload` but does not invoke
  `dhRatchetDecrypt` server-side — server must not, by design, but the route
  still needs to attach the recipient's stored skipped-keys row so a follow-up
  browser-side hydration call has what it needs).
- New route: `GET /api/chats/:id/e2e-session/:recipientActorId` returning the
  server-side `{ skippedKeys[], lastSeenEphemeralJwk?, lastSeenCounter? }`
  for a recipient to rebuild local chain state.
- Per-recipient `e2e_session` rows: extend `e2e_session` shape with a
  `skipped_keys_summary` JSON column to carry the recipient's seen-chain
  context without putting crypto material on the server (only counters +
  ephemeral pubkeys, never chain keys).

**Frontend (`src/frontend/e2e/`, `src/frontend/browser.ts`):**
- `src/frontend/e2e/decrypt-message.ts` — call `dhRatchetDecrypt` with
  hydrated chain state + skipped keys; fall back to the existing symmetric
  decrypt path when payload is non-E2E (semantic-preserving backwards compat).
- `src/frontend/e2e/hydrate-chain-state.ts` — on message stream open for an
  `at-rest` chat, fetch `/e2e-session/:recipientId` + actor's local private
  key from `key-store.ts`, recompute the chain root via
  `deriveSharedSecret(localPriv, theirEphemeral)`, and produce a usable
  `DhRatchetState`.
- Hook into the existing chat-template hydrate path: replace the read-time
  server-decrypt call (where present) with a client-decrypt step; preserve
  fallback for `none`/`standard` chats.

**DB (`src/db/migrations/`, `src/db/schema-core.ts`):**
- New migration `058_e2e_receiver_state.ts`: extend `e2e_session` with
  `last_seen_ephemeral_jwk`, `last_seen_counter`, `skipped_keys_summary`
  columns; these are server-stored because they're per-recipient metadata
  (counters + public ephemerals only — no keys).
- Regenerate downstream artifacts:
  `src/db/schema-core.ts`, `src/db/schema.ts`, `src/db/schema-manifest.ts`,
  `src/test-utils/insert-helpers.ts`, `src/validation/db-schemas.ts`.

**Acceptance criteria:**
- Inbound E2E message visible in the chat UI without server-side decrypt.
- Manual destroy of one actor's localStorage forces a fresh `dhRatchetDecrypt`
  fail (expected — client-side state is the source of truth).
- Out-of-order delivery (counter gap) yields correct plaintext via the
  skipped-key retention path; previously-decoded counter values are still
  accessible.
- `bun test src/crypto/ src/frontend/e2e/ src/db/ src/routes/ -t "e2e"` green.
- `bun run plan:sync` green; `bun run scripts/check-db-schemas.ts` green.

## Phase F — Full Signal-grade double ratchet

Out of scope for Phase E; replace the current ECDH-ephemeral approach with:
- **X3DH initial key agreement** (signed prekeys + one-time prekeys + DH ratchet).
- **Asynchronous initial-key delivery** (server stores the signed prekey
  bundle; receiver fetches on first contact).
- **Unbounded skipped-key retention** (today capped at `maxSkip`).
- **Asynchronous ratchet state persistence** (IndexedDB-wrapped-key store;
  today localStorage JWK).

Tracked here for forward visibility; not blocked on anything but Phase E.

## Phase G — UI affordances

Blocked on `TASK-encryption-architecture-clarification.md` until the LLM-with-
E2E strategy is settled (deniability + server-mediated generation vs. client-
side inference vs. secure-enclave). Scope:
- Per-chat tier dropdown (`none` / `standard` / `at-rest`).
- Key-recovery flow (social recovery, opt-in escrow, or none — pending arch).
- LLM-with-E2E consent UX (per-message or per-chat toggle; explicit server
  decrypt with auditing).
- Client-side key management screen
  (`src/components/settings/key-management.html` per
  `epic-encryption-workflow.md` §"Phase 2c").


git issue: 5d9636b
