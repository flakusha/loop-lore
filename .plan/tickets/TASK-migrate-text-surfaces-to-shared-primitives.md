<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Migrate text surfaces to shared primitives

**Status:** In Progress
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

The mobile composer was refactored onto shared primitives (auto-resize, draft store, text-enhance, text-toolbar) in tickets 1–3. This ticket migrates the remaining chat surfaces to use the same primitives for consistency. Constraints: additive wiring only — no behavior changes to existing flows; each surface must work within its existing Alpine scope (ChatState, gmPanel, gmGuidance, or standalone factory). The text-toolbar include pattern (`{{> text-toolbar.html }}` wrapped in `x-data="textToolbar({ target: '#id', chatId: ... })"`) is the documented approach for enhance/undo/preview. Auto-resize uses `x-init="autoResize($el)"` + `@input="autoResize($el)"` on textareas. Surfaces without a stable id (e.g. wizard fields using `:value` + `@input`) extend the existing handler chain with `autoResize($el)` inline.

**Acceptance Criteria:**

- [x] Implementation complete (batch A: chat surfaces)
- [x] Tests passing
- [x] Documentation updated

### Batch A — Chat surfaces (this commit)

- [x] Message edit textarea (`message-list.html`) — auto-resize
- [x] GM guidance (`_gm-guidance-body.html`) — auto-resize + text-toolbar (pilot surface)
- [x] GM panel (`gm-panel.html`) — auto-resize on shadow/whitenote/entity-seed textareas + toolbar on entity-seed
- [x] Memory panel (`memory-panel.html`) — auto-resize on create + edit textareas + toolbar on create
- [x] Chat settings modal (`chat-settings-modal.html`) — auto-resize on custom-instructions, prompt-override, ownership-reason
- [x] Wizard panel (`wizard-panel.html`) — auto-resize on field textareas (inline in @input handler chain)
- [x] Sections panel — no textareas present (inputs only), no changes needed
