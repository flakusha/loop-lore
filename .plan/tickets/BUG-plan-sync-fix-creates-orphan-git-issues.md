<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `plan:sync --fix` mass-creates orphan git issues for placeholder hashes

**Status:** Open
**Priority:** critical
**Priority Tier:** P0
**Source:** git issue `4bc4b34`
**Area:** build-integrity
**Effort:** Small

## Summary

`scripts/worktree/` plan-sync tooling, when invoked as `plan:sync --fix`, mass-creates orphan git issues for placeholder hashes. The correct behaviour is to skip placeholder hashes entirely (e.g. hashes that are not yet real, or that lack a backing `.plan/tickets/*.md` file). This is a tooling defect that pollutes the issue tracker and obscures the real backlog.

## Evidence

Source location: `scripts/worktree/` (plan sync tooling — exact file to be located by grepping for `--fix` and `placeholder` handling)

```ts
// scripts/worktree/plan-sync.ts (approx) — pseudo-code of the bug
for (const hash of pendingHashes) {
  if (looksLikePlaceholder(hash)) {
    // BUG: falls through and creates a real git issue
    createGitIssue({ title: `orphan: ${hash}`, body: "" });
  }
}
```

The placeholder-hash branch should `continue;` / `return;` instead of creating a real git issue.

## Impact

Tooling bug. Every run of `plan:sync --fix` against placeholder hashes inflates the git-issue list with no-op entries. Operators lose signal in the real backlog and waste cycles triaging non-issues. Severity is medium per the cluster table, but classified P0 here per the build-integrity release-blocking rule from `priority-p3-p5.md` row 83.

## Fix

In the plan-sync script under `scripts/worktree/`, locate the branch that handles placeholder hashes (search for `--fix`, `placeholder`, or the orphan-issue creation call) and short-circuit it: skip placeholder hashes entirely instead of creating git issues. Add a small unit test that runs `plan:sync --fix` against a fixture containing placeholder hashes and asserts zero new git issues were created.

## Acceptance Criteria

- [ ] `plan:sync --fix` does NOT create git issues for placeholder hashes
- [ ] A test (or smoke run) demonstrates zero new git issues are created when only placeholder hashes are present
- [ ] Real (non-placeholder) hashes still get their git issues created as before — no regression on the happy path
- [ ] `bun run check` gate stays green (18/18)
- [ ] No existing orphan git issues are auto-closed by the fix; cleanup of historical orphans is a separate ticket if desired

## Related

- `.plan/backlog/open-build-integrity.md` — cluster parent
- git issue `49dd182` / `2c747e0` / `7bb2bdf` — sibling build-integrity tsc errors