<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: crypto: activitypub-keys.ts has zero test coverage

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/crypto/activitypub-keys.ts (Ed25519 generation, SMK-encrypted private key storage, rotation status transitions, active key lookup) has no unit or integration tests despite handling critical signing-key crypto. Fix: add round-trip tests (generate -> getActive -> rotate -> verify old expired/new active) and error-path tests (SMK not configured, DB failure during rotation).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
