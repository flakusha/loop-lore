<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS export bundle profiles

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, export, licensing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Bundle profiles (DCC bag: assets + manifests + lineage + licenses[]; publish bundle; chat clip) over the game-asset-pipeline-export builder + licensing rows. AC: a scenario export produces a deterministic bundle listing every asset with lineage pointers and license strings; NSFW/NC assets require explicit export consent.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
