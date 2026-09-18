<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Invisible GM Only Quest And Ark System

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-gm-shadow-notes
**Tags:** quests, gm, visibility

**Summary:**
Quests and arks that are only visible to admin/GM, with tracked triggers and timeline backfills.

**Context:**
GM-only quests currently impossible: every existing quest is user-visible. The world-RPG batch calls for global/secret quests ("the secret vault was opened", "the old evil woke up", "a village was destroyed") that GM tracks but players discover through propagation.

**Acceptance Criteria:**
- Extend `quests` table with `visibility enum(gm_only|gm_and_assistant|conditional|public)`.
- Triggers: `quest_triggers(id, quest_id, kind, payload_json, fired_at nullable, created_at)`. Kinds: `time-elapsed | event | standing-change | relationship | info-propagation | admin-trigger`.
- GM UI: separate "GM/secret quest log" (`epic-gm-shadow-notes` linker).
- Timeline backfill: when a trigger fires, GM quest log records it; optionally emits a `whitenote` per `epic-gm-shadow-notes`.
- Tests: GM-only quest hidden from player UI; trigger fires on event; reveal-on-trigger updates visibility.
