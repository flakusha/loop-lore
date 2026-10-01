<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: New-chat e2e reads chat_participants once before the best-effort persona PUT completes

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

On 2026-10-01 a review + finalize sweep over ~13 unmerged worktrees surfaced this. It was NOT a regression introduced by the sweep — it is a pre-existing condition observed while diagnosing an unrelated flaky e2e assertion. Evidenced by baseline comparison: a throwaway `git clone --shared --branch dev` at 9198f57eb passed the full 35-file browser suite 6/6, the branch worktree passed single-file 3/3, and the failing assertions also reproduced on a plan-only branch that touches nothing in `src/`.

File: `tests/e2e/flows/browser/new-chat-advanced-fields.browser.ts:147`, assertion `persona should be linked to participant` — Expected `b1000aaa-0000-4000-a000-000000000000`, Received `null`.

The persona is attached by a SECOND client-side request, `PUT /api/v1/chats/:id/persona`, wrapped in a try/catch and explicitly labelled best-effort at `src/frontend/pages/new-chat/submit.ts:123-137`. The test reads `chat_participants` a single time, so a slow or failed attach yields `null`. Note this failure reproduced on the plan-only branch `stale-worktree-gates`, which touches nothing under `src/` — proof the assertion is racing the client, not the server.

Fix direction: poll `chat_participants` for the persona link rather than reading once, with a bounded retry. Do not delete the assertion.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
