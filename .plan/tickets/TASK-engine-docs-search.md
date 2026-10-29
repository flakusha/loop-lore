<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: engine-docs-search

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-game-engine-sdks
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Fast doc retrieval for engine APIs as harness context: chunked Godot/Bevy API docs (llms.txt-style) retrievable by the engine-build loop so code-gen has version-pinned API context. Owner epic: epic-game-engine-sdks. Anchors: src/plugins/registry.ts:1-60 (registry surface); src/harness/exec-log.ts:1-60 (exec failure-mining feed); .plan/tickets/TASK-scene-to-importable-godot-gltf-bundle.md (prior glb-lite export slice). Refs: https://llmstxt.org (docs-as-context pattern); https://dev.to/toyama0919/using-llmstxt-with-cursor-and-claude-code-a-concrete-playbook-4jln (playbook). Acceptance: version-pinned doc chunks served to harness context for Godot 4.x API; retrieval latency budgeted; stale-version warning. Source: game-engine expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
