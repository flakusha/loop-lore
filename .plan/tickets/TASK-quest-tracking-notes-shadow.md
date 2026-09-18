<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quest tracking, notes + shadow notes (frontend reuse)

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-quests-encounters.md
**See also:** epic-gm-shadow-notes.md
**Status:** Open
**Priority:** Medium

## Scope

- Quest tracker panel: active/completed quests, objective checklist,
  progress updates; notes + GM shadow notes reuse the same panel
  component with visibility gating (shadow notes GM-only).
- Quest/note CRUD dispatches existing quest + note routes; shadow-note
  content never ships to non-GM clients (server-gated, frontend only
  hides the affordance).

## Acceptance

- Objective check-off persists and reflects in tracker + chat.
- Non-GM session receives no shadow-note payload (verify via network).
