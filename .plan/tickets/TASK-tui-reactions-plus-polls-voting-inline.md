<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI reactions plus polls voting inline

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-frontend-emoji-reactions
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-4 TUI slice (T11): reactions + polls voting inline.

**Ground state:** Reactions: `message_reactions` table + grouped route (scout-verified `src/routes/message-reactions.ts:106-113`). Polls: `src/chat/service/polls.ts` (one poll/message, single-replace / multi-toggle, closed → 409). TUI: neither (docs rows confirmed, no `reaction|poll` under `src/tui/`).

**Adopt/adapt/defer:** ADAPT Matrix MSC2675 + MSC3381 relation envelope as schema direction only — `m.annotation` → `{key, ts, count}` aggregates, `/relations` pagination; polls = `m.poll.start` (kind, max_selections, ≤20 answers, plaintext fallback) + `m.poll.response` (`m.selections`, one-vote-per-sender latest-wins, empty = unvote) + `m.poll.end` (results untrusted); redacted relations excluded (https://github.com/matrix-org/matrix-spec-proposals/blob/main/proposals/2675-aggregations-server.md, https://github.com/matrix-org/matrix-spec-proposals/blob/main/proposals/3381-polls.md). Migration DEFERRED — three-table unification is out of scope.

**Acceptance criteria:**

- [ ] Reaction tallies render under their message row.
- [ ] `/react <emoji>` + poll vote/close map to existing endpoints incl. closed-poll 409 surfacing.
- [ ] Poll creation stays web-only (documented non-goal; `/poll` deep-links the web composer).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
