<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat composer: tab-complete for commands, mentions, emoji

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-chat-commands.md

## Summary

No tab-completion anywhere (grep tabComplete|tab-complete: 0 matches in src + .plan). Slash palette exists (command-palette.ts, filtered list, tests) but Tab does nothing; @mention dropdown (chat-group.ts) and :...: emoji autocomplete (TASK-emoji-colon-format-frontend, open) lack a unified Tab-accept affordance. Acceptance: Tab accepts top palette/mention/emoji suggestion; Shift-Tab cycles; Esc preserves current dismiss; a11y focus handling per epic-accessibility-input.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
