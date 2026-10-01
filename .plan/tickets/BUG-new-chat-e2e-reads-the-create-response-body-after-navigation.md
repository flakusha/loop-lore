<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: New-chat e2e reads the create response body after navigation has already committed

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

On 2026-10-01 a review + finalize sweep over ~13 unmerged worktrees surfaced this. It was NOT a regression introduced by the sweep — it is a pre-existing condition observed while diagnosing an unrelated flaky e2e assertion. Evidenced by baseline comparison: a throwaway `git clone --shared --branch dev` at 9198f57eb passed the full 35-file browser suite 6/6, the branch worktree passed single-file 3/3, and the failing assertions also reproduced on a plan-only branch that touches nothing in `src/`.

File: `tests/e2e/flows/browser/new-chat-advanced-fields.browser.ts:129` (and the comment block at lines 110-116 already half-documents this).

`src/frontend/pages/new-chat/submit.ts:122-149` does `await res.json()` and then calls `location.assign(...)`. Playwright discards the response body once the navigation commits, so `res.json().catch(() => null)` resolves to `null` and the assertion at :129 fails with `error: create response should carry chat id` / `Received: undefined`.

The test's own comment at :110-116 says the eager `bodyPromise` narrows the window; it does not close it. Observed failing on two different worktrees during a finalize sweep on 2026-10-01, and passing on the same code on a subsequent run — the failure is load/timing dependent, not deterministic.

Fix direction: take the chat id from the `?chatid=` URL after `location.assign`, or from the DB row matched on the unique `Advanced-Chat-${Date.now()}` name. Do not paper over it with a retry-only assertion that still reads the doomed body.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
