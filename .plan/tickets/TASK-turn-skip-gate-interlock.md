<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Turn skip gate interlock

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

Skip is never gated (no claim to contradict, cannot be refused). A hard-block refusal notice MUST offer skip as the escape hatch so a blocked actor is never trapped with "edit or stall". A soft-refuse (action narrated as obstacle) consumes the turn: no skip after refusal for the same beat (one outcome per beat).

## Acceptance Criteria

- [ ] Skip path bypasses the consistency gate entirely
- [ ] Hard-block refusal notice exposes a working skip action in one click
- [ ] Refused beat rejects a subsequent skip for the same beat
- [ ] Tests passing
