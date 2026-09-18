<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit t.UnionEnum schema fields: absent value silently defaults to first member (Elysia 1.4)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Elysia 1.4 compiles t.UnionEnum with default = first member, so an ABSENT property (query AND body) is silently replaced by the first member instead of staying undefined or failing validation. Confirmed by probe: POST {} to AdminRoleUpdateBody yielded role=admin before the fix. Fixed this session: AdminRoleUpdateBody (plain string + runtime ADMIN_ROLES check, 400 on invalid), ChatSearchQuery.type/searchPriority and ChatListQuery.sort (t.Enum, which is safe on query). Remaining sweep: src/validation/schemas/primitives.ts (assistantRole, type, vnLayout, vnTransition, vnImageScaling, responseLengthPreset, QuickReplyTriggerSchema, MemoryCarrySchema, ChatHistoryCarrySchema, OutputStylePresetSchema, TagProvenanceSchema, GmTurnPrioritySchema) and any other t.UnionEnum/t.Enum in BODY schemas — for each: decide whether absent-must-stay-absent (convert to plain string + runtime check or t.Enum semantics) or first-member-as-default is actually the intended contract. Add a lint rule or code-practices doc entry banning t.UnionEnum in Elysia body/query schemas.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
