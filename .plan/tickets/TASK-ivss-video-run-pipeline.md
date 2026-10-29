<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS video run pipeline

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, comfyui, video
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scene run: compile scene to workflow payload, upload references asset-id-style (masks via POST /upload/mask), submit through the kind-aware ComfyUI client, track via the jobs API (list + cancel), poll, persist the clip asset with queue-time generation facts, and link to the scene. First video-kind consumer of waitForFiles/runWorkflowFiles (the audio engine already consumes the audio kind). AC: end-to-end run against a stubbed ComfyUI in CI; seeds survive as strings (>2^53 round-trip test); output asset is lineage-linked to the scene.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
