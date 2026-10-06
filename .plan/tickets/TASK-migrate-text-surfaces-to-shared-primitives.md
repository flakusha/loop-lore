<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Migrate text surfaces to shared primitives

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-chat-composer-flows
**Tags:** frontend, composer, migration

**Summary:**

## Problem

Many frontend text surfaces lack composer features (auto-resize, draft persistence, enhance/preview toolbar). The mobile composer is a bare `<input>` bypassing all features; message edit, GM guidance, settings, memory, sections, character, world, persona, quest, and blog textareas all lack these affordances.

## Change

Apply the extracted primitives (tickets 1–3) to every applicable frontend text surface, priority-ordered:
- Mobile composer `src/components/chat/mobile-composer.html` (currently a bare `<input>` bypassing all features).
- Message edit textarea `src/components/chat/message-list.html:210`.
- GM guidance `_gm-guidance-body.html` + GM panel `gm-panel.html`.
- `chat-settings-modal.html` (custom instructions + prompt override).
- `memory-panel.html`.
- `sections-panel.html` + `wizard-panel.html`.
- Character panels (`src/components/character/*.html`).
- World `src/partials/worlds/*.html` + `src/views/world-edit.html`.
- Personas/quests/blog textareas.

## Acceptance

- Each migrated surface gets auto-resize + draft persistence (where a stable id exists) and, where useful, the toolbar (enhance/preview).
- No regression in existing surface behavior.
- Documented pattern for remaining surfaces.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
