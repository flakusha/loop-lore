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

Phase 2 of the composer-reuse epic: `textToolbar()` (src/frontend/alpine/text-toolbar.ts) resolves a host textarea by CSS selector — no ChatState, no `$refs.messageInput` — and wires `enhanceText`/`UndoEnhance`/`autoResize`/`renderPreviewHtml` behind a hamburger dropdown. The server-failure toast distinction (injection-blocked vs generic) is preserved via the same `onServerFailure` hook the composer uses; a missing target sets `disabled` so hosts can include the partial unconditionally. Tests stub `document.querySelector` per the repo's setup-globals DOM (no happy-dom in bun test). The `style-*` menu rows are hidden without `chatId` (server needs chat context). The storage option from the original sketch was dropped — nothing persists yet; it returns with the phase-3 host wiring if a surface needs drafts.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
