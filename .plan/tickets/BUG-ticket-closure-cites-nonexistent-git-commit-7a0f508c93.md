# Ticket closure cites nonexistent git commit (7a0f508c93)

<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Type:** Bug
**Summary:** `BUG-test-e2e-env-default-mismatch.md` (git issue `f511378`) was closed citing commit `7a0f508c93`, which is not a valid git object in this repository. No gate or tool validates that a commit sha cited at closure actually resolves. Nothing prevents this from recurring on every future close.

**Context:** The substantive fix for the E2E safeguard issue landed in commit `b53b1b7b8` (`fix(e2e): export E2E_SAFEGUARD=1 in developer-facing e2e scripts`). The ticket is not about the fix being absent — `package.json` lines 66-71 now carry `E2E_SAFEGUARD=1` in all four affected scripts (`test:e2e`, `test:e2e:browser`, `test:e2e:smoke`, `test:all`). The ticket is about the closure's integrity and auditability.

## Evidence

```
$ git cat-file -t 7a0f508c93 2>&1
fatal: Not a valid object name 7a0f508c93

$ git log --all --oneline | grep 7a0f508c
<empty — 7a0f508c93 does not exist in this repository>
```

## Real commit

The actual fix is at `b53b1b7b8`:

```
$ git log -1 --format='%H %s' b53b1b7b8
b53b1b7b83f7f02985cc7ea8ac1b55008153bff3 fix(e2e): export E2E_SAFEGUARD=1 in developer-facing e2e scripts
```

The `.plan/tickets/BUG-test-e2e-env-default-mismatch.md` `git issue:` footer correctly points to GitHub issue `f511378`. The bogus `7a0f508c93` was cited at closure time (outside the `.md` file) and is what needs auditing/reconciliation.

## Root cause

No gate validates commit SHAs cited during ticket closure. The `plan:validate` gate (via `giwt plan validate`) checks format, linkage, backlog, naming, and epics — but has no check that the commit sha referenced in a closed ticket's metadata actually resolves as a git object. A typo, a miscopy, or a stale reference closes silently with no audit trail.

## Proposed remediation

Add a `git-sha-resolve` sub-check to `plan:validate` (or a standalone gate) that, for every **Done** ticket with a commit reference in its metadata, runs `git cat-file -t <sha>` and fails if the sha does not resolve. The check should:

- Run only when a commit reference is present in the ticket's closure metadata.
- Fail with a clear message: `commit sha <sha> does not exist in this repository`.
- NOT modify the ticket file — only gate.

Alternatively (or additionally): add a guard to `giwt close` that verifies the cited sha before finalizing the issue state.

**Acceptance Criteria:**

- [ ] A gate (sub-check of `plan:validate` or `giwt close` guard) detects non-resolving commit SHAs cited in closed ticket metadata.
- [ ] The gate fails with a clear message naming the invalid sha and the ticket it appears in.
- [ ] The gate does NOT modify any file — it only reports failure.
- [ ] `BUG-test-e2e-env-default-mismatch.md` (f511378) is updated to cite the correct commit `b53b1b7b8` at closure.

git issue: 83bdf58
