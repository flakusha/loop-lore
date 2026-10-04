<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Guest world public browse: read-only public worlds

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-guest-access.md

**Summary:**

## Problem

WorldVisibility.Public worlds are joinable by non-members (src/routes/chat-search/join.ts) but there is no read-only browse path for unauthenticated visitors.

## Change

- Guest can list WorldVisibility.Public worlds and read their public metadata (name, description, locations, NPCs) without joining.
- No world join, no chat creation, no participation for guests.
- Registered users keep the existing join flow.
- Public world listing endpoint accepts guest context (read-only).

## Acceptance

- Guest lists public worlds and reads public world detail.
- Guest cannot join or mutate anything in a world.
- Private/unlisted worlds invisible to guest.
- Registered join flow unchanged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
