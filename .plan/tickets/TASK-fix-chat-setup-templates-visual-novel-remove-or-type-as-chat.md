<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix chat_setup_templates.visual_novel: remove or type as ChatRenderingOverride

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-character-core-system
**Labels:** state-machine, schema, cleanup

## Summary

chat_setup_templates.visual_novel is typed as Generated<number> — semantically wrong and should never have been a number. Either remove it entirely (the 076_drop_chats_visual_novel.ts migration dropped visual_novel from chats, but this table retains it as a vestigial column) or retype it as Generated<ChatRenderingOverride | null> using the existing state machine. This is a schema correctness issue in the chat_setup_templates table. Must update generate-db-types.ts and schema-core.ts.

## Acceptance Criteria

- [ ] visual_novel column either dropped or typed as Generated<ChatRenderingOverride | null>
- [ ] generate-db-types.ts updated
- [ ] schema-core.ts updated
- [ ] Tests passing
- [ ] Documentation updated
