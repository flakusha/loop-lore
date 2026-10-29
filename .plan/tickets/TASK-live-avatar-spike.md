<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: live-avatar-spike

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-visual-novel-mode
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Spike a live 2D/3D web-canvas avatar driven by LLM emotion tags + TTS visemes (web only, TUI stays static). Owner epic: epic-visual-novel-mode. Anchors: src/frontend/vn/scene-renderer/ (render-scene, stage); src/frontend/vn/sprite-stage.ts:176; public/css/vn.css:1058 (.vn-speaker-active); src/assets/service/delete.ts:84-85 (avatar_asset_id back-refs). Refs: https://github.com/pixiv/three-vrm (VRM spike); https://github.com/met4citizen/TalkingHead (MIT lip-sync reference). Acceptance: canvas island renders one VRM via three-vrm behind flag; static emotion expression; perf marks logged; TUI unchanged. DEFER: hosted D-ID/HeyGen/Tavus. Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
