<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: engine-feedback-loop

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-embeddable-engine-game-frontend
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Screenshot/video capture + multimodal review + harness code-gen loop for engine builds: headless run captures output, review step flags visual regressions, harness re-issues code-gen with failure context. Owner epic: epic-embeddable-engine-game-frontend. Anchors: src/harness/exec-log.ts:1-60 + exec-recorder.ts (failure-mining feed); src/plugins/registry.ts:1-60; .plan/tickets/TASK-scene-to-importable-godot-gltf-bundle.md (export slice this loop closes). Refs: https://github.com/jonathancaruso/godot-game-harness (headless tests + screenshot loop); https://github.com/youichi-uda/godot-qa (input replay + screenshot diff). Acceptance: headless export-to-screenshot round trip; baseline diff; failure context re-fed to harness; no new engine dep. Source: game-engine expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
