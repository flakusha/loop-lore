<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: External manifest interop

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-generation-metadata
**Tags:** assets, metadata
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Read A1111/Civitai-style generation metadata from imported images (via an equivalent parser tier) so externally sourced references become self-describing. AC: importing a ComfyUI/A1111-generated PNG recovers prompt/model/seed into generation facts with provenance imported-format; failure paths degrade to no facts, never wrong facts.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
