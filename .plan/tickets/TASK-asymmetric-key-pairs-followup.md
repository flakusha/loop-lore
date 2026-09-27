<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement True Client-Side E2E for at-rest+ Tier (4-phase delivery)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** + Phases A–D shipped (commit `10b203b4` on dev); remainder split into 4 child tickets
**Priority:** Medium
**Effort:** Large
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-architecture-clarification (Phase G child only)
**Git issue:** 5d9636b (open — re-open on next phase)

## Summary

Implement genuine end-to-end encryption for the `at-rest` encryption tier where the server
cannot decrypt message content. Server holds no client-held secrets. All current encryption
is server-mediated symmetric (SMK → actor keys → chat keys); the server can decrypt everything.

This is a **deferred** ticket, split off from `BUG-private-tier-no-true-e2e.md` (now closed)
which chose the rename-now/defer-E2E path.

## Child Tickets

| Ticket                        | Scope                                                        | Order |
| ----------------------------- | ------------------------------------------------------------ | ----- |
| `TASK-e2ee-open-bugs.md`            | Fix open bugs against shipped ratchet/base64 code             | 1st — before Phase E |
| `TASK-e2ee-receiver-wiring.md`      | Phase E: receiver-side wiring, chain-state hydration, on-receive browser decrypt | 2nd |
| `TASK-e2ee-double-ratchet.md`       | Phase F: Signal-grade double ratchet (X3DH, unbounded skipped keys, IndexedDB state) | 3rd |
| `TASK-e2ee-crypto-ui.md`            | Phase G: UI affordances (tier dropdown, key recovery, LLM consent) | 4th — blocked on arch clarification |

## Status

Foundation + Phases A–D shipped on dev (commits `17410ce1`, `10b203b4`). This parent is
now an umbrella: all remaining task checkboxes live in the four child tickets listed above,
in the order shown. No task checkboxes are tracked here.

## Context

`BUG-private-tier-no-true-e2e.md` — **Closed**. Documents the evidence that current
`at-rest` tier is server-mediated and not true E2E.

`TASK-asymmetric-key-pairs.md` — **Existing ticket** (partially overlaps; design
reference). Defines the asymmetric key protocol (ECDSA/X25519, forward secrecy).

`TASK-encryption-browser-pre-encrypt.md` — **Existing ticket**. Browser encrypt on send
and decrypt on receive; partially built but receive path missing.

| Ticket | Scope | This Ticket vs That |
|--------|-------|---------------------|
| `TASK-asymmetric-key-pairs.md` | Full asymmetric key protocol | Reference; this ticket focuses on the minimum viable true E2E path |
| `TASK-encryption-browser-pre-encrypt.md` | Browser encrypt/decrypt wiring | This ticket covers the E2E key distribution and key escrow, not the UI wiring |

## Design Direction (shared context)

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

### Minimum Viable True E2E

1. **ECDH key pairs per actor** — private keys never sent to server.
2. **Public key distribution** — new joiners receive all participants' public keys.
3. **ECDH key agreement** — no server involvement.
4. **Server-side key escrow** — optional, opt-in, separate from core flow.
5. **Client-side encrypt + decrypt** — server stores ciphertext blobs only.
6. **Forward secrecy** — session key rotation.

## Shipped Foundation (Verification Notes, 2026-08-22)

First slice landed in commits `f534c4d3` + `a2f90efa` + `1108b063` (branch
`asymmetric-e2e`, removed after finalization) and was merged to dev as commit `17410ce1`:

- **Migration:** `src/db/migrations/055_e2e_pubkeys.ts` — `actor_e2e_pubkeys`
  table (`actor_id`, `public_key_jwk`, `algorithm` default `ECDH-P256`,
  `created_at`, `expires_at`, `revoked_at`; soft-revoke pattern; uniqueness-across-rotations
  enforced in application code via `registerPublicKey`).
- **Crypto core:** `src/crypto/e2e/key-pairs.ts` — ECDH P-256 keypair gen,
  JWK import/export, `deriveSharedSecret` (ECDH → HKDF-SHA256 → AES-256-GCM
  session key). Non-extractable CryptoKey handles at public-import + session-key stages.
- **Frontend store:** `src/frontend/e2e/key-store.ts` — `localStorage`-backed
  per-actor private-key JWK persistence (IndexedDB-with-wrapped-key is the hardening follow-up → Phase F child).
- **Server registry:** `src/crypto/e2e/server-registry.ts` — register,
  get-active, list-active, revoke operations.
- **HTTP:** `src/routes/actor-e2e-pubkeys.ts` — `GET/PUT/DELETE /api/actors/:id/e2e-public-key`. Owner-only writes, any-auth reads.
- **Tests:** 9 unit tests (key-pairs) + 12 integration tests (server registry, in-memory SQLite with full migration set). All pass.

## Files to Modify (remaining phases — shared)

- `src/db/schema-core.ts` — session state extensions
- `src/db/migrations/` — new migrations
- `src/crypto/` / `src/frontend/e2e/` — receiver wiring, ratchet upgrades
- Key open questions carried forward: forward-secrecy strategy sign-off (Phase F child), key recovery decision (Phase G child).

## Risk

**High.** Cryptographic protocol design, forward secrecy implementation, browser compatibility, performance. Requires external security audit before production.

## References

- `BUG-private-tier-no-true-e2e.md` — closed bug that spawned this ticket
- `TASK-asymmetric-key-pairs.md` — existing ticket (design reference)
- `TASK-encryption-browser-pre-encrypt.md` — browser wiring ticket
- `docs/frontend/encryption.md` — current (honest) tier documentation
- `docs/spec/encryption-workflow.md` — current workflow spec

git issue: 5d9636b


## Verification 2026-09-26

Verdict: **still-open-expanded** (umbrella; foundation + Phase A–D confirmed in-tree; 1 of 4 children done).

Src checked:
- Foundation present: `actor_e2e_pubkeys` table + indexes (`001_init.ts:829-986`, `schema-core.ts:319`, `schema-manifest.ts:1003`), `src/crypto/e2e/key-pairs.ts` (ECDH P-256, JWK, HKDF→AES-256-GCM), `server-registry.ts` (register/get-active/list/revoke), `src/routes/actor-e2e-pubkeys.ts` (`GET/PUT/DELETE /api/actors/:id/e2e-public-key`), `src/frontend/e2e/key-store.ts` (localStorage per-actor JWK), key-pairs + registry tests green-shape.
- Beyond foundation: `src/crypto/e2e/double-ratchet.ts` + `ratchet.ts` (`nextRatchetStep`, tested), `src/frontend/e2e/encrypt-message.ts` + `decrypt-message.ts` (receiver decrypt via `loadOrCreateKeyPair` + `deriveSharedBytes` + ratchet step), `group-encrypt-message.ts`, `e2e-session`/`e2e-roundtrip` integration tests — i.e. receiver-side wiring (Phase E scope) has substantial code in-tree.
- Children (all exist): `TASK-e2ee-open-bugs.md` (done), `TASK-e2ee-receiver-wiring.md` (open), `TASK-e2ee-double-ratchet.md` (open), `TASK-e2ee-crypto-ui.md` (open, blocked on arch clarification).

Refreshed deltas:
- No checkboxes live here (by design) — verify each child against the in-tree receiver/ratchet code before closing: open-bugs fixes vs `dh-ratchet.ts` semantics, receiver-wiring vs `decrypt-message.ts` hydration gaps (chain-state, skipped keys, IndexedDB hardening), double-ratchet vs X3DH/out-of-order/forward-secrecy window, crypto-ui vs tier dropdown/recovery/consent. Keep this parent open until all four land + external audit (risk section stands).
