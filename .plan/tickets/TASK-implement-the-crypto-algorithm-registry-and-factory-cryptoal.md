<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Implement the crypto algorithm registry and factory (CryptoAlgorithm, createEncryptor/createDecryptor)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-crypto

**Summary:**

Found while reconciling `.plan/epics/epic-crypto.md`. Phases A-D shipped on `10b203b4` (E2E pubkey migration `055_e2e_pubkeys`, `src/crypto/e2e/key-pairs.ts`, `src/frontend/e2e/key-store.ts`, `src/crypto/e2e/server-registry.ts`, `src/routes/actor-e2e-pubkeys.ts`, plus the `EncryptionLevel.AtRest` rename via migration `057`).

The algorithm registry the epic specifies does not exist. `src/crypto/pipeline.ts:170` hardcodes `payload.algo !== "aes-256-gcm"` rejection. There is no `CryptoAlgorithm`, `registerAlgorithm`, `AlgorithmFactory`, `createEncryptor`, or `createDecryptor` anywhere in `src/crypto/`.

Implementation: the `CryptoAlgorithm` interface plus a registry, a factory resolving algorithm to encryptor/decryptor, and replace the hardcoded rejection in `pipeline.ts` with a registry lookup that still rejects unknown algorithms. Keep aes-256-gcm as the default so existing ciphertext stays readable — the registry must not silently change the on-disk format.

Coverage is tracked separately by `TASK-crypto-algorithm-factory.md` and `TASK-crypto-algorithm-tests.md`; this ticket exists because the epic could not be closed without the registry itself.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
