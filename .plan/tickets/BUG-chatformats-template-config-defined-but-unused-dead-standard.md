<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: chatFormats template config defined but unused (dead standard-template feature)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

LlmTemplateConfig.chatFormats {user,assistant} in config/sections/templates.ts has zero usages in src. Chat message-format wrapping unimplemented. Wire into message formatting or remove from schema.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
