<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add E2eAlgorithm and E2eSessionKind enums for e2e tables

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-e2e-integration-testing

## Summary

Replace string-typed algorithm/kind in actor_e2e_pubkeys and e2e_sessions with strictly typed enums. E2eAlgorithm: x25519, x25519-hkdf, kyber-768. E2eSessionKind: direct, group. The parts/003_worlds.ts and parts/004_chats_actors.ts migrations have these as raw strings. Must create src/db/enums-core/e2e-type.ts with enums, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
