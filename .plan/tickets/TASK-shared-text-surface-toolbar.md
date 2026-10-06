<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Shared text-surface toolbar

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-chat-composer-flows
**Tags:** frontend, alpine, composer, ui

**Summary:**

## Problem

There is no reusable way to attach composer affordances (enhance, preview, auto-resize, undo) to an arbitrary text surface. Each surface would need to reimplement the same button/hamburger menu pattern.

## Change

Build a reusable Alpine component + server-rendered partial:
- `src/frontend/alpine/text-toolbar.ts` — `textToolbar()` component: reactive `{open}`, `enhance(level)`, `undo()`, `togglePreview()`, operating on a target textarea resolved from a passed ref/selector; uses `enhanceText`, `UndoEnhance`, `autoResize`, and the preview primitive.
- `src/components/text-toolbar.html` — button + hamburger dropdown (auto-resize toggle, markdown preview, improve levels, analyze, undo), following the existing `input-area.html` prompt-improve `x-data="{open:false}"` + `@click.outside` pattern.
- Register in `src/frontend/alpine/index.ts`.

## Acceptance

- Component registers in `src/frontend/alpine/index.ts`.
- Partial renders on a host surface.
- Factory unit-tested.
- No chat / `$refs.messageInput` coupling.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
