<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat composer: markdown pre-render/preview before send

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done

**Linked work:** composer preview renders through the same `renderMarkdown`
path, so `:shortcode:` expansion shows pre-send too (`render.ts`,
`input-area.html` composer-preview).
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-chat-commands

## Summary

Composer has zero pre-send preview (grep markdown.*preview|prerender in src/frontend/alpine: 0 matches). Sources: chat-send.ts sendMessage, chat-types/composer-pre-send-state.ts (pre-send state exists, no preview flag), chat-actions/command-palette.ts. Acceptance: toggleable preview rendering sent markdown (links, code, emoji shortcodes) pre-send; keyboard shortcut; no behavior change at defaults.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
