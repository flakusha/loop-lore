<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Encryption & Cryptographic Infrastructure

**Status:** 🟡 Partial
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** encryption, aes-256-gcm, key-management, e2ee, browser-crypto
**Epic ID:** EPIC-2026-CRYPTO

## Summary

End-to-end encryption for chat messages, assets, and stored data. AES-256-GCM
encryption with key management, rotation, group key distribution, and
browser-side pre-encryption. Foundation for chat privacy and secure multi-user
scenarios.

## Algorithm Extensibility

The encryption system MUST support future additions of new algorithms without modifying core crypto code. This is achieved through:

- **Algorithm Registry**: A central registry that maps algorithm identifiers to implementations
- **Factory Pattern**: `createEncryptor(algorithm)` and `createDecryptor(algorithm)` factories that return algorithm-specific implementations
- **Plugin Hooks**: Crypto hooks in the plugin system allow registering new algorithms at runtime
- **Configuration-Driven**: Algorithm selection is driven by config, not hardcoded values
- **Backward Compatible**: Existing AES-256-GCM and compression algorithms remain the default

### Design

```typescript
// Algorithm registry - plugins register here
interface CryptoAlgorithm {
  id: string; // e.g., "aes-256-gcm", "chacha20-poly1305"
  type: "encryption" | "compression" | "key-derivation";
  encrypt: (data: Uint8Array, key: CryptoKey, opts?: Record<string, unknown>,) => Promise<Uint8Array>;
  decrypt: (data: Uint8Array, key: CryptoKey, opts?: Record<string, unknown>,) => Promise<Uint8Array>;
  keyLength: number;
  nonceLength: number;
}

interface AlgorithmFactory {
  register(algorithm: CryptoAlgorithm,): void;
  getAlgorithm(id: string,): CryptoAlgorithm | undefined;
  listAlgorithms(type?: "encryption" | "compression" | "key-derivation",): CryptoAlgorithm[];
  createEncryptor(algorithmId: string, key: CryptoKey,): Encryptor;
  createDecryptor(algorithmId: string, key: CryptoKey,): Decryptor;
}
```

### Requirements

1. **Registry API**: `registerAlgorithm()`, `getAlgorithm()`, `listAlgorithms()`
2. **Factory API**: `createEncryptor()`, `createDecryptor()` with algorithm ID
3. **Plugin Hook**: `onCryptoAlgorithmRegister` hook for runtime registration
4. **Config Support**: `encryption.algorithm` and `compression.algorithm` config fields
5. **Fallback**: Graceful fallback to default algorithm if requested algorithm not found
6. **Validation**: Algorithm validation on registration (key sizes, nonce sizes, etc.)

### Scope

### Client-Side Pre-Encryption

- Browser encrypts before send (zero-knowledge server)
- WebCrypto API integration
- Key derivation from user passphrase

### Wire Message Pipeline

- Encrypt/decrypt in message send/receive pipeline
- Transparent to existing chat logic
- Metadata preserved (timestamps, sender) while content encrypted

### Key Management

- Key generation, storage, rotation UI
- Per-user and per-chat key sets
- Recovery key generation and backup

### Group Key Distribution

- Multi-party key agreement for group chats
- Key rotation on member join/leave
- Forward secrecy guarantees

### Access Management

- Role-based access to decryption keys
- Admin key escrow (optional, configurable)
- Audit log for key access

## Related Epics

- `epic-chat-lifecycle-moderation.md` — privacy and moderation coexistence
- `epic-chat-privacy.md` — privacy controls
- `epic-plugin-system.md` — encryption plugin hooks
- `epic-testing-benchmarking.md` — crypto performance benchmarks

## Integration Points

### Systems This Epic Depends On

| System          | What It Provides       | How Used                   |
| --------------- | ---------------------- | -------------------------- |
| Chat Lifecycle  | Message pipeline hooks | Encrypt/decrypt in transit |
| Auth Middleware | User identity          | Key ownership verification |

### Systems That Depend On This Epic

| System        | What It Consumes      | How Used                   |
| ------------- | --------------------- | -------------------------- |
| Chat Privacy  | Encryption primitives | Message confidentiality    |
| Asset System  | Asset encryption      | Encrypted media storage    |
| Plugin System | Crypto hooks          | Custom encryption backends |

## Tickets

- `FEAT-encryption-foundation-aes-256-gcm.md` — 🟨 Partial (core built)
- `TASK-client-side-encryption-aes-256-gcm.md` — ✅ Done
- `TASK-encryption-access-management.md` — ⬜ Not started
- `TASK-encryption-architecture-clarification.md` — ⬜ Not started
- `TASK-encryption-browser-pre-encrypt.md` — ⬜ Not started
- `TASK-encryption-group-key-distribution.md` — ✅ Done
- `TASK-encryption-key-management-ui.md` — 🟨 Partial (routes done, UI pending)
- `TASK-encryption-key-rotation.md` — 🟨 Partial (manual done, auto missing)
- `TASK-encryption-wire-message-pipeline.md` — ✅ Done
- `TASK-stable-stored-chat-key-future.md` — ⬜ Not started
- `TASK-encryption-auto-key-rotation.md` — 🟨 Partial (built, broken — see BUG-key-rotation-noop-orphans-history)
- `TASK-world-location-encryption.md` — ⬜ New
- `TASK-asymmetric-key-pairs.md` — ⬜ New
- `TASK-asymmetric-key-pairs-followup.md` — 🟡 Partial (Foundation + Phases A–D shipped on dev commit `10b203b4`; Phases E–G queue receiver-side wiring / Signal-grade ratchet / UI affordances — see "Client-Side E2E — 4-Phase Plan" below)
</input>
- `TASK-fix-crypto-isolation.md` — ✅ Done (was misdiagnosed)
- `TASK-non-standard-browser-crypto-research.md` — ⬜ Research: JS/WASM crypto beyond WebCrypto

- `TASK-crypto-algorithm-tests.md` — ⬜ Not started

## Related Epics (Extended)

- `epic-non-standard-browser-crypto.md` — JS/WASM crypto libs, ChaCha20, Argon2, post-quantum readiness

## Known Bugs (2026-08)

See `.plan/tickets/BUG-encryption-tier-not-enforced.md`,
`BUG-chat-key-history-loss-join-leave.md`,
`BUG-key-rotation-noop-orphans-history.md`,
`BUG-private-tier-no-true-e2e.md`, `BUG-auto-rotation-config-drift.md`.

### Open bugs against Phase B/C/D code (2026-08-23)

Cross-references from `TASK-asymmetric-key-pairs-followup.md` "Open bugs against
the shipped code":
- `BUG-dhratchetdecrypt-mutates-opts-state-aliasing-hazard.md` — aliasing hazard in `dh-ratchet.ts`.
- `BUG-initdhratchetopts-theirinitialpub-declared-but-never-read.md` — dead param in `initDhRatchet`.
- `BUG-base64-tobase64-coerces-undefined-to-0-via-bytes-i-0.md` — `?? 0` mask in `utils/base64.ts`.
- `BUG-hot-reload-test-ts-asserts-trivially-true-on-emfile-enoent-c.md` — pre-existing config-infra coverage gap; defer to backlog.
</input>

## Client-Side E2E — 4-Phase Plan (2026-08-22)

True client-side E2E encryption for the `at-rest` (== `Private`) tier, where
the server cannot decrypt message content. Foundation shipped via merge
commit `17410ce1` to dev (originally on `asymmetric-e2e`, finalized and
removed 2026-08-22); four subsequent slices complete the feature.

Each phase is its own worktree + ticket slice; phases must ship in order.
Foundation phase already shipped:

**Foundation (✅ merged to dev)**

- Migration `055_e2e_pubkeys`: `actor_e2e_pubkeys` table (per-actor public
  key JWK + algorithm + soft-revoked audit history).
- `src/crypto/e2e/key-pairs.ts`: ECDH P-256 generateKeyPair / importPublicKey
  / importPrivateKey / exportPublicJwk / exportPrivateJwk / deriveSharedSecret
  (ECDH → HKDF-SHA256 → AES-256-GCM session key).
- `src/frontend/e2e/key-store.ts`: `localStorage`-backed per-actor private-key
  JWK persistence. v1 accepts the same threat surface as other persisted
  secrets (session token, theme prefs); IndexedDB-with-wrapped-key is the
  documented hardening follow-up.
- `src/crypto/e2e/server-registry.ts`: registerPublicKey / getActivePublicKey /
  listActivePublicKeys / revokePublicKey. Soft-revokes on rotation.
- `src/routes/actor-e2e-pubkeys.ts`: `GET/PUT/DELETE /api/actors/:id/e2e-public-key`.
  Owner-only writes; any-auth reads.
- Tests: 9 unit (key-pairs) + 12 integration (server-registry, in-memory
  SQLite + full migration set). 21/21 pass.

### Phase A — Ratchet primitive + 1:1 E2E (NEXT)

Smallest viable slice that puts an encrypted message on the wire.

- `src/crypto/e2e/ratchet.ts` — symmetric-key ratchet:
  `nextSessionKey(ck) → { chainKey, messageKey }`. Single-message
  (no chain advancement yet).
- `src/frontend/e2e/encrypt-message.ts` — fetch recipient's pubkey via the
  new HTTP route, ECDH-derive session key, encrypt plaintext, format
  `{ciphertext, nonce, ephemeralPubKey, chainKey}`.
- `src/frontend/e2e/decrypt-message.ts` — symmetric counterpart using the
  same `(ephemeralPubKey, ciphertext, nonce, chainKey)` tuple.
- Migration `056_e2e_payload`: add `messages.e2e_payload` (TEXT, nullable),
  `messages.e2e_session_id` (TEXT, nullable), new table `e2e_sessions`
  (sender/recipient pair → chain state).
- `src/crypto/e2e/e2e-session.ts` — server-side session lookup (read-only;
  chain state itself never lives on the server).

**Tests:** 1:1 roundtrip, tamper detection, persistence round-trip.

### Phase B — Chain advancement (forward secrecy)

- Advance chain key after each message via HKDF step.
- `messages.e2e_chain_index` tracks position; receiver persists chain state
  locally (localStorage v1; IndexedDB-wrapped-key later).
- Out-of-order handling (skip + back-fill).

**Tests:** sequential messages, skipped messages, replay ordering, forward-
secrecy claim verification.

### Phase C — Group chat (sender-key distribution)

- Sender generates one symmetric chain, ECDH-wraps the initial chain key
  to each participant.
- Wire format adds `per_recipient: { actorId: { wrappedKey, ephemeralPubKey } }`.
- Server picks per-recipient wraps from `chat_participants` of the chat.
- Join/leave triggers chain-key rotation.

**Tests:** 3-participant group, new joiner receives wrapped key, member
removal excludes future message wraps.

### Phase D — Sender-side integration with the chat route

- `src/routes/messages/post.ts` — accept `e2e_payload` for `at-rest` tier
  chats; reject server-mediated encryption path for those chats.
- `src/routes/messages/helpers.ts` (read path) — return `e2e_payload` to
- `src/crypto/at-rest.ts` — relax `case "private"` throw for the
 payload path; the rename to `EncryptionLevel.AtRest` (tracked in
 `BUG-private-tier-no-true-e2e` §"Resolution") remains pending.
 ✅ DONE — `at-rest` is the canonical wire value; the `private` tier
 handler has been removed; migration `057` rewrites existing rows;
 `EncryptionLevel.Private` removed (clean cutover, no @deprecated
 alias). Merge commit on dev: `10b203b4`.

**Tests:** full HTTP route round-trip, server-encrypt rejection for
`at-rest` tier, read path returns ciphertext unchanged.

### Phase D+ — Honest docs + audit pass (2026-08-23)

- `src/crypto/at-rest.ts` — header & body comments rewritten to drop
  the false "server cannot decrypt" / "true E2E" claim. `at-rest` is
  a **wire-passthrough** tier: the server stores whatever the caller
  submits and returns it on read. The caller is responsible for
  pre-encrypting when true client-side E2E is desired. True E2E
  (server cannot decrypt) remains deferred to TASK-asymmetric-key-
  pairs-followup Phase E+.
- `src/db/enums-core/flags.ts` — `EncryptionLevel` docstring rewritten
  to match the wire-passthrough semantics.
- `src/db/migrations/057_encryption_level_at_rest_rename.ts` —
  docstring tightened (no more "true E2E" claim).
- `src/crypto/at-rest.test.ts` + `at-rest.integration.test.ts` — test
  descriptions clarified ("server is a passthrough" replaces
  "server does not decrypt").
- New: `src/db/enums-core/rename-verification.test.ts` — guards
  against reintroduction of `EncryptionLevel.Private` symbol.
- `BUG-private-tier-no-true-e2e.md` ticket body needs reconciliation
  (see note in the commit message); the `e2e/` directory is **active**
  and not deleted, contradicting the ticket's "Dead wiring deleted"
  claim.
</input>

All four phases shipped via `bun x tsgo --noEmit -p tsconfig.backend.json`
exit 0 + `bun test src/crypto/ src/frontend/e2e/ src/db/` → 531 pass / 0 fail.
Merge commit on dev: `10b203b4`. Open bugs against the shipped code listed
in "Open bugs against Phase B/C/D code" above; must resolve before Phase E.

### Phase E (NEXT) — Receiver-side wiring

- `GET /api/chats/:id/e2e-session/:recipientActorId` returns
  `{ skippedKeys[], lastSeenEphemeralJwk?, lastSeenCounter? }` so the
  browser can rebuild local chain state without server-side plaintext.
- Migration `058_e2e_receiver_state.ts` extends `e2e_session` with counters
  + public-ephemeral metadata only (never keys).
- Frontend `src/frontend/e2e/hydrate-chain-state.ts` consumes the route,
  rebuilds `DhRatchetState`, and feeds `decrypt-message.ts`.
- Full scope: see `TASK-asymmetric-key-pairs-followup.md` §"Phase E".

### Phase F — Signal-grade double ratchet (X3DH + unbounded skip)

### Phase G — UI affordances (per-chat tier dropdown, key-recovery, LLM-with-E2E consent UX)

Phase G blocked on `TASK-encryption-architecture-clarification.md`
(LLM-with-E2E strategy). Phases F + G see
`TASK-asymmetric-key-pairs-followup.md` §"Phase F / G".
</input>
### Open design questions (must be resolved before Phase B/C)

- **Forward secrecy re-keying cadence**: per-message vs per-session?
- **Group rekey on member join/leave**: re-encrypt history? Re-key the chain?
- **Key recovery / escrow** (out of scope for v1).
- **LLM integration for E2E chats**: client-side inference / secure
  enclave / E2E + deniability for generation.
