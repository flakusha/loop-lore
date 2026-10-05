<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Refine impersonation constraint to location/timeline scope

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Current updateImpersonation() in src/chat/service/participants.ts checks only world_id. A character at a specific location should only be impersonated by one user at that location; different timelines or isolated chats should allow the same character to be impersonated by different users. Scope to (world_id, location_id) or (world_id, timeline_id). Private/disconnected chats (no world_id) remain exempt.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
