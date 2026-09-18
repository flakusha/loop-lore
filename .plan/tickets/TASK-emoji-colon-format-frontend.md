<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: `:...:` emoji shortcode support (frontend)

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-frontend-emoji-reactions.md
**Status:** Open
**Priority:** Medium

## Scope

- Shared shortcode map + tokenizer used by chat, group chat, and gallery
  comment render paths; unknown codes left as literal text.
- Composer autocomplete (`:fi…` → popup) + picker button; keyboard
  navigable; htmx partials render server-side fallback.
- Allowlisted names only; no raw HTML injection.

## Acceptance

- `:smile:` + custom set render identically in 1x1, group, gallery.
- Unknown `:nope:` stays literal; no console errors.
