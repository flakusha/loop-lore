<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Classification-based battle start with world/chat ruleset

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Follow-up to D1-C. Today battles start only via explicit /battle start and /attack (manual-only by decision D1-A). Design and implement a story-intent classifier path that can auto-start (or propose starting) a battle when narrative signals combat, with the world/chat ruleset applied: world rpg_combat opt-in gate, chat-setup template features, fail-open parity outside world chats. Must handle false-positive risk on narrative containing strike/hit language, and define the UX for proposing vs auto-starting. Blocks on trigger-design ticket b28e5e4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue 93e50aa.

git issue: 93e50aa
