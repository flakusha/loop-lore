<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Ticket-Ops Endpoints — Open/Close/Comment

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task / Infrastructure
**Tags:** agent, tickets, plan, api
**Epic:** epic-recursive-self-improvement

Agent API endpoints for ticket lifecycle (`open`/`close`/`comment`) so remote agents can file and close `.plan/` tickets without a TTY — closes the Part B gap (agent closes placeholder tickets, files cluster tickets).

## Core Features

- `src/agent/api/tickets.ts` — `POST /api/v1/agent/tickets/open`, `POST /api/v1/agent/tickets/close`, `POST /api/v1/agent/tickets/comment`; scoped `agent:tickets` token (extends #22 token scopes).
- Open validates BriefingScript linter (#17) before filing; close requires resolution note + linked commit/PR; every op lands in `agent_actions` (#9).
- Guards: no close of tickets with open blockers; no orphan git-issue creation (regression guard for `BUG-plan-sync-fix-mass-creates-orphan-git-issues-for-placeholder`).

## Acceptance Criteria

- [ ] Agent opens ticket passing #17 linter; invalid ticket rejected with linter errors cited
- [ ] Agent closes own-filed ticket with resolution note; close without note rejected
- [ ] Placeholder-ticket close does not create orphan git issues (regression test)
- [ ] Every op audited in `agent_actions` with ticket id + result

## Files

- `src/agent/api/tickets.ts` — new
- `src/agent/api/tickets.test.ts` — new
- `src/agent/api/router.ts` — mount ticket routes (extends #5)

## Notes / Verification

- Depends on #5 (router + auth), #9 (audit), #17 (BriefingScript linter), #22 (token scopes).
- Reuse `.plan/` ticket file format; no new issue-tracker schema.


git issue: e9d9428
