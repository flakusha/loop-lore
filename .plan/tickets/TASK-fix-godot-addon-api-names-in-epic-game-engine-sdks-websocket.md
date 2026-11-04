<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Fix Godot addon API names in epic-game-engine-sdks (WebSocketClient to WebSocketPeer)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Fix .plan/epics/epic-game-engine-sdks.md lines 72,78-83: Godot 4.x has no WebSocketClient (404 on 4.7/4.4 class pages; 3.x-only). Replace with WebSocketPeer + poll() per frame, HTTPRequest unchanged. Verify against docs.godotengine.org stable class pages before editing. Source: .tmp/research/game-engine-integration-review.md Godot slice. Status note: UNRECONFIRMED direct re-fetch failed tool-side; re-verify live pages in-ticket.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
