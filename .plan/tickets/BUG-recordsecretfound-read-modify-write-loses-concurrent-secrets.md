<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: recordSecretFound read-modify-write loses concurrent secrets

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — recordSecretFound (src/rpg/replayability/service/playthrough.ts:183-217) already writes with optimistic concurrency: the UPDATE carries `.where("updated_at", "=", playthrough.updatedAt)` (:211) and throws `was modified concurrently` when zero rows are affected (:214-216), so a concurrent loser can no longer overwrite the winner's secrets; secrets are also deduped (:196-198). The lost-update window the ticket describes is closed.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-replayability

**Summary:**

recordSecretFound (src/rpg/replayability/service/playthrough.ts:181-206) reads playthrough.metadata, parses the secrets array, pushes a new secret, and writes the full metadata back. Two concurrent calls read the same metadata, and the second write overwrites the first secret. Impact: Concurrent secret discoveries lose one secret from the playthrough record. Fix: Use a JSON append operation or wrap in a transaction with row locking.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): recordSecretFound (src/rpg/replayability/service/playthrough.ts:183-217) already writes with optimistic concurrency: the UPDATE carries `.where("updated_at", "=", playthrough.updatedAt)` (:211) and throws `was modified concurrently` when zero rows are affected (:214-216), so a concurrent loser can no longer overwrite the winner's secrets; secrets are also deduped (:196-198). The lost-update window the ticket describes is closed.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue b9235db (registry tip: 2b5bd97ec Konstantin Fedotov Close issue)
