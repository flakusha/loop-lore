<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend Chat Messages Bubble & Detail Levels

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Related:** docs/frontend/chat/messages.md

## Summary

Implement chat message bubble styling and detail-level tiers per
`docs/frontend/chat/messages.md` — currently an untracked spec (no `.plan/`
ticket or epic references it).

## Context

`docs/frontend/chat/messages.md` defines the UX but has **zero** `.plan/`
linkage (discovered during docs↔planning audit). Spec is small (P0 items): bubble
styling and detail levels, both marked priority tier P0. This is foundational chat
rendering consumed by every other chat spec, so closing the gap is high-value/low-effort.

## Acceptance Criteria

- [ ] Message bubble styling matches spec (P0)
- [ ] Detail levels implemented per priority tiers (P0)
- [ ] `bun run check` green; manual UI smoke pass
- [ ] Ticket linked from `docs/frontend/chat/messages.md`
