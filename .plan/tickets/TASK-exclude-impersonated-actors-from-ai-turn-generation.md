<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Exclude impersonated actors from AI turn generation

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

When a user impersonates a character in a group chat, the character is added as a chat participant (AI participant) AND the user's participant row gets impersonate_actor_id set. Turn selection in group-cascade.ts:165 only excludes actor_type === 'user', so the impersonated character is still selected for AI generation. Result: both the user plays as the character AND the LLM generates responses for the same character. Fix: exclude the impersonated actor from AI turn selection when a user is impersonating it.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
