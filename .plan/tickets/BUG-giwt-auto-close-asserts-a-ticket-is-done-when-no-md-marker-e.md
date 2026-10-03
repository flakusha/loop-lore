<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt auto-close asserts a ticket is done when no .md marker exists and the work is unmerged

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

## Observed instance

Git issue `refs/issues/2afc68e7-49c0-49fa-b813-5ba804598ea2` was closed as `done` at **2026-10-03 19:30:46 +0900** by commit `0c471da6f222e5d9f810bdc70aa1c85dfc707a16`:

```
author: Konstantin Fedotov <zenflak@gmail.com> 2026-10-03 19:30:46 +0900
sig:    %G? = N  (UNSIGNED)
subj:   Auto-closed: appended .md marker marks TASK-SCHEDULED-MESSAGES-REMINDERS done
tree:   4b825dc642cb6eb9a060e54bf8d69288fbee4904   <- the EMPTY tree
```

The subject claims it "appended .md marker". There is no marker: `git ls-tree -r 0c471da6f` returns nothing, and `git branch -a --contains 0c471da6f` returns nothing — the commit is hollow and no branch contains it. The commit is also unsigned (`%G? = N`).

The work the closure claims to record was committed **50 minutes later**: `59580c0ed feat(chat): scheduled messages, rem...` at 2026-10-03 20:21:10 on branch `chat-composer-flows`, still unmerged. `.plan/tickets/index.json` correctly still says `status: "open"` for that entry — the registry's `done` assertion and the index's `open` are the mismatch that has been failing the gates.

## General failure

The auto-close path has three independent defects:

1. **It trusts a claimed `.md marker`.** Nothing verifies the marker was actually appended before declaring the ticket done. The claim is recorded only in the commit subject, and the subject is a free-text string no gate cross-checks.
2. **It emits a commit containing no files at all.** The resulting commit has the empty tree, so there is no artifact anywhere — not in the ticket, not in the index, not on any branch — recording why the closure happened. The state transition lives only in a commit object that no branch contains and that review tools never surface.
3. **It does not verify the referenced work is merged.** The closure asserts completion of work that is still unmerged on a feature branch.

## Impact

`plan - validate` and `plan - ticket index (sync)` fail repo-wide, blocking every branch finalize. A hollow unsigned commit that no branch contains is invisible to review: it cannot be found via `git log`, cannot be attributed to a branch, and fails nothing.

## Gap to close

A closure should:

- (a) be **refused** when its own commit has an empty tree — a state-change commit with no files is never a legitimate marker append, and the commit must be rejected rather than recorded; and
- (b) not mark a ticket done for work that is **not reachable from the root branch** — if the implementing commits are only on an unmerged branch, the closure is premature and must be rejected or deferred until the work is merged.

A closure commit should also be signed like every other commit in this repository; the current path produces `%G? = N`.

**Acceptance Criteria:**

- [ ] Auto-close refuses to record a closure when the marker commit's tree is empty, and reports why.
- [ ] Auto-close refuses to mark a ticket done when the referenced work is not reachable from the root branch.
- [ ] Auto-close commits are GPG-signed like other repository commits (`%G?` != N).
- [ ] The regression is covered by a test that fails against current behaviour: closing with no marker present must not flip the issue to `closed`.
- [ ] `plan - validate` and `plan - ticket index (sync)` exit 0 with the state asserted by the closure consistent with the index.

**Context:**

Found while triaging the 2026-10-03 branch-finalization block on `feat-conversation-branching`: `plan - validate` and `plan - ticket index (sync)` failed on dev and on every branch because the git issue registry said `done` for `2afc68e7` while `index.json` said `open`. No ticket anywhere references `2afc68e` or the slug `TASK-scheduled-messages-reminders`, so the premature closure was pointed at by nothing and went unnoticed. Reopening the issue via `giwt state 2afc68e7-49c0-49fa-b813-5ba804598ea2 open` made both gates exit 0.
