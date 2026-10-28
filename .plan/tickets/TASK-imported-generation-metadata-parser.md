<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Imported generation metadata parser

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-generation-metadata
**Tags:** assets, metadata
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Recover generation facts from imported assets via a tiered parser (embedded sidecar chunk, then graph traversal, then regex), each result stamped with how it was obtained; regex tier reuses src/regex/ and src/assets/png-text-chunk.ts (iTXt support added where needed). AC: importing a ComfyUI-generated PNG recovers prompt/model/seed; failure paths degrade to no facts, never wrong facts.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
