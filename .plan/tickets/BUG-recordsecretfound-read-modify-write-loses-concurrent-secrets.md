<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: recordSecretFound read-modify-write loses concurrent secrets

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

recordSecretFound (src/rpg/replayability/service/playthrough.ts:181-206) reads playthrough.metadata, parses the secrets array, pushes a new secret, and writes the full metadata back. Two concurrent calls read the same metadata, and the second write overwrites the first secret. Impact: Concurrent secret discoveries lose one secret from the playthrough record. Fix: Use a JSON append operation or wrap in a transaction with row locking.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
