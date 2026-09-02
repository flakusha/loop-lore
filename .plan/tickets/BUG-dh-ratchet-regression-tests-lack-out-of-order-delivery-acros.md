<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: dh-ratchet regression tests lack out-of-order delivery across ratchet boundary

**Status:** [OK] Fixed (fix-review-bugs-round2, `f32d0a45`)
**Priority:** medium
**Effort:** Medium

## Summary

src/crypto/e2e/dh-ratchet.bugs.test.ts (added in ad8e01ea) verifies the re-seed fix but has two gaps: (1) no scenario where old-epoch messages arrive out of order (e.g. counter=2 before 0,1), forcing skipOldChain to store skipped keys, then a new-epoch message follows - the case where a wrong fix could pass silently; (2) test calls dhStep() on the sender with the same primitive the receiver uses, so it verifies self-consistency, not spec conformance. Fix: add known-answer vectors or an independent-chain derivation. Found in dev-fix review 2026-09-01.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

- Gap (1): `dh-ratchet.bugs.test.ts` gains the out-of-order scenario — m2
  arrives first (chain-advance retains keys for c0/c1), both late messages
  drain the skip store via `consumedSkippedKeyIds`, then a rotated-ephemeral
  (new-epoch) message must decrypt. Mutation check: removing the DH-branch
  re-seed makes this test fail; the old tests alone do not cover the stale
  chain advanced by the skip.
- Gap (2): new `dh-ratchet.kat.test.ts` pins `deriveChainKeyFromRoot` and
  `chainStep` (single + 3-step chain) to hex vectors computed by an
  independent Node `hkdfSync` implementation. Mutation check: bumping the
  KDF info string fails the vectors while every self-consistent round-trip
  test still passes — exactly the blind spot this gap described.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (`src/crypto/e2e/`: 70 pass, 0 fail; mutation-verified)
- [x] Documentation updated (this section)
