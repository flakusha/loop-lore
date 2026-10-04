<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Group-chat minors from 2026-10-04 review

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Three MINOR verified gaps, one batch: (1) muted actor burns a mention slot - cascade mention candidates come from chat participants; mute is enforced only later in resolve-actor.ts:64-70 (returns null) so the turn slot dies silently (src/generation/auto-gen/group-cascade.ts:84-89); filter muted_until in the candidate fetch or fall through to strategy. (2) ASCII-only mention regex /@([A-Za-z0-9_-]+)/g (src/group-chat/mention-parser.ts:56) - unicode display names unmentionable and the @token inside emails pings a participant; unicode-aware token class + negative lookbehind. (3) Placeholder coverage test asserts typeof "group-chat" === "string" (src/group-chat/group-chat-coverage.test.ts:2-6) - delete or replace with real assertions. Coverage route-level gaps feed open ticket 3234406.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
