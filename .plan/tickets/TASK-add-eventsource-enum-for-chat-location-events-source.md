<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add EventSource enum for chat_location_events.source

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation

## Summary

Replace string-typed source in chat_location_events with EventSource enum. The 040_chat_location_events.ts migration has source as raw string. Must create src/db/enums-core/chat-event-source.ts with enum, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
