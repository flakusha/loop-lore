<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Faction membership → relationships and standing propagation

**Summary:** The character Relationship model supports target_type "faction" but faction membership produces no relationships. Wire faction membership into the relationship layer: members automatically gain ally relationships with co-members, Faction standing modulates relationship strength with that faction's members (high standing strengthens ally ties, weakens enemy ties), and relationship trust feeds lore-propagation distortion (trusted sources distort less — consumed by TASK-world-lore-lifecycle-confidence-decay-distortion).
**Context:** Complements TASK-faction-standing-schema and TASK-faction-standing-and-reputation-drift-integration (schema + drift, both Not Started); this ticket owns the character-relationship projection of that data.
**Acceptance Criteria:** Membership change creates/removes ally relationships (idempotent, scoped per world); standing deltas propagate to co-member relationship strength on drift tick; distortion lookup prefers high-strength friend/family/faction-ally relationships; prompt section renders faction-tinted relationships; tests for join/leave/standing-shift propagation.

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Depends on: TASK-faction-standing-schema (data), TASK-shared-character-domain-models
- Consumed by: TASK-world-lore-lifecycle-confidence-decay-distortion

**Branch:** open on dev.
