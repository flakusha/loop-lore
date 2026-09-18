<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Invisible Note Scope Global Local Temporal Random

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-gm-shadow-notes
**Tags:** notes, scope, visibility

**Summary:**
Notes scoped globally, locally, temporally, randomly, by interaction, by standing, by relationship.

**Context:**
A "note" here is a GM-only annotation that ties to scope tags (where it applies, when it applies, who it applies to). Reuses `shadow_notes` schema from `epic-gm-shadow-notes`.

**Acceptance Criteria:**
- Add `note_scope` table (note_id, scope_kind enum, scope_value) with kinds: `global | local | temporal | random | interaction | standing | relationship`.
- Resolution: when generating chat, the assistant pulls only those shadow notes whose scopes resolve against the active chat context (location, time, actor standings, relationship graph).
- Random scope rolls once per chat and pins to the roll result.
- Tests: scope filter pulls exactly matching notes; random scope stable per chat.
