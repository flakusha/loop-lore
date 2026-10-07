<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Property-test the isEncryptedPayload predicate against the decrypt path

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-api-library-distribution.md

**Summary:**

isEncryptedPayload (src/crypto/pipeline.ts:25) classifies stored content, and the surrounding compress-then-encrypt pipeline is well covered. The predicate itself has no dedicated test, so the classification and the decrypt path can drift apart without anything failing.

Invariant: isEncryptedPayload(v) is true exactly when decryptThenDecompress(v, key) does not throw.

Generate v from schemaToArbitrary over the encrypted-payload shape plus the plaintext shape, so both sides of the predicate get exercised rather than only the happy one. The compress/decode round-trip and the crypto round-trip already have property-equivalent tests and are deliberately excluded.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
