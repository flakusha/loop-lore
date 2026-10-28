<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Krita shared ComfyUI tier

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, krita, docs
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Documented Krita tier: Krita AI Diffusion (GPL-3, ComfyUI-only backend) pointed at the same ComfyUI instance; loop-lore exports references into a working dir, hand-edit in Krita, re-ingest via the watch tier. No sdcpp bridge (unsupported upstream, closed not-planned). AC: end-to-end doc plus smoke path; working-dir contract (formats, naming) documented; no new in-process Krita code.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
