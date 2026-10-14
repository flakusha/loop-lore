<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Git commands in commit-check and version-bump are built by string interpolation

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Both git-executing scripts pass template strings to execSync, so a repository-controlled branch or tag name containing shell metacharacters becomes command injection whenever the script runs — including from a git hook.

Evidence read on dev:

- src/scripts/commit-check.ts:157-162 — the range is built as tag + '..HEAD' from git describe output and interpolated into git log.
- src/scripts/version-bump.ts:79-81 — a grep pattern is built from the major version and interpolated into a pipeline.
- src/scripts/version-bump.ts:99-102 — the same range interpolation as commit-check.
- src/scripts/version-bump.ts:269-270 — further interpolated git calls.

The major-version interpolation is numeric and low risk; the tag-derived range is the real exposure, since a tag is whatever anyone with push access named it.

Fix: switch to argv-array execution (Bun.spawnSync with an argv array), which removes the shell entirely, or validate refs against a strict charset before interpolating.

Source: .tmp/cat-jam/review-tui-scripts.md P1-1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
