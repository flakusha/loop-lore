<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: `:...:` emoji shortcode support (frontend)

**Effort:** Medium
**Summary:** Allowlisted `:shortcode:` rendering shared by chat, group chat, and blog/gallery comment paths.
**Context:** Render core shipped in `src/frontend/alpine/chat-utils/emoji.ts` (`renderShortcodes`, hasOwn-guarded allowlist kept in sync with `QUICK_EMOJIS`) and hooked into `renderMarkdown`, so every consumer renders identically. Unknown codes and backtick spans stay literal.
**Acceptance Criteria:** `:fire:` renders 🔥 in 1x1, group, and blog comments; unknown `:nope:` stays literal; no console errors.

**Progress:** emoji shortcode allowlist + render helper, `:` autocomplete (Tab-accept parity), and keyboard/grid picker landed; chat + group chat share one render path.

**Epic:** epic-frontend-emoji-reactions
**Status:** In Progress
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
