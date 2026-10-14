<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add a coverage assertion for the opt-in NSFW gate on by-ID routes

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

canAccessNsfw, checkNsfwWithConsent and checkChatNsfwAccess are invoked per route. Today the gate is consulted in src/routes/assets.ts, src/routes/chats/create.ts, src/routes/nsfw/* and the generation hooks, but nothing enumerates the NSFW-touching endpoints and asserts that each one calls it. A new by-ID route that reads NSFW content without consulting the gate passes review and ships.

Evidence read on dev: the three exports live in src/middleware/nsfw-gate/index.ts; no test enumerates the NSFW-touching route set, and no route-level checklist exists in the repo or docs.

Fix: a test that walks the mounted route table, selects the endpoints whose handlers touch NSFW columns or content, and asserts each one invokes a gate function — or, cheaper and equally enforceable, a ban on reading an NSFW column in a route module without a gate import.

Related but separate, already filed: TASK-residual-review-nits covers the ignoreModeration escape hatch, which has no production caller.

Source: .tmp/cat-jam/review-auth-transport.md P2-2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
