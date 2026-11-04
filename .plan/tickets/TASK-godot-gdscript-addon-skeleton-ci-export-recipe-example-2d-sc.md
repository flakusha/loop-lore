<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Godot GDScript addon skeleton + CI export recipe + example 2D scene

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Recommended lazy slice from game-engine review: loop-lore-godot/ with WebSocketPeer client (see WebSocketPeer correction ticket) + HTTPRequest helper with doc comments for gdtoolkit-doctool, CI running gdtoolkit/GUT/headless import/export-release, one example 2D scene. Explicitly out: MCP server, C# client, custom importer, hand-written API reference. Source: .tmp/research/game-engine-integration-review.md Godot slice.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
