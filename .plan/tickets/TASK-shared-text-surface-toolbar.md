<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shared text-surface toolbar

**Status:** Done
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

**Resolved:** 2026-10-22 registry-driven close: git issue a00d051 (registry tip: 782e807ef Konstantin Fedotov Auto-closed: appended .md marker marks TASK-SHARED-TEXT-SURFACE-TOOLBAR)

## Resolution (2026-10-22, worktree chat-composer-flows)

Shipped: `src/frontend/alpine/text-toolbar.ts` — `textToolbar({ target,
chatId? })` resolves the host textarea by CSS selector (no ChatState, no
`$refs.messageInput`); reactive `open`, `enhance(level)`, `undo()`,
`togglePreview()` over `renderPreviewHtml`; a missing target sets `disabled`
so hosts can include the partial unconditionally; `style-*` rows hidden
without `chatId` (server needs chat context). Partial
`src/components/text-toolbar.html` with the usage contract in its header
comment; registered in `src/frontend/alpine/index.ts` (`import
"./text-toolbar"`).

Verified 2026-10-22 in worktree chat-composer-flows (dev tip 8b0d2770):
registration present at `src/frontend/alpine/index.ts:53`; factory unit tests
in `text-toolbar.test.ts`; 14+ host surfaces include the partial (see
TASK-migrate-text-surfaces-to-shared-primitives for the per-surface list).
