<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add ConsentAction and ConsentScope enums for nsfw_consent_state

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation

## Summary

Replace string-typed action/scope in nsfw_consent_state with strictly typed enums. ConsentAction: given, revoked. ConsentScope: nsfw_encounter, nsfw_chat, nsfw_world. The 069_nsfw_consent_state.ts migration defaults to 'nsfw_encounter' and has action as raw string. Must create src/db/enums-core/consent-type.ts with enums, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
