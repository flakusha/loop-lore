<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Generation fact capture at queue time

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-generation-metadata
**Tags:** assets, metadata, comfyui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Capture workflow facts (prompt, model, LoRAs, sampler, seed, dimensions) on the asset at generation time via the ComfyUI queue-time seam; persist a WorkflowFacts-style struct on job completion with provider-submitted provenance, plus the overrides loop-lore applied. AC: assets persisted by a ComfyUI generation expose their facts via the metadata read API; dimensions come from the actual file, never the workflow.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
