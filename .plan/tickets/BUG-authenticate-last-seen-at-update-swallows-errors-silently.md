<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: authenticate last_seen_at update swallows errors silently

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue 869eda3): src/middleware/auth/authenticate.ts:117-118 catch now warns via getLog()?.warn('Failed to update last_seen_at', ...) — no longer a silent `/* non-critical */` swallow.
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-logging

**Summary:**

`src/middleware/auth/authenticate.ts:119-121` wraps the `last_seen_at` DB
update in a bare `try/catch` with only a `/* non-critical */` comment.
A persistent failure (disk full, DB corruption) goes entirely unwarned.

## Evidence

`src/middleware/auth/authenticate.ts:119-121`:

```ts
  } catch {
    /* non-critical */
  }
```

## Source

- review-middleware.md finding 3
- review-consolidated.md nit 3
- File:line: `src/middleware/auth/authenticate.ts:119-121`

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 869eda3 (registry tip: a4e5ea089 Konstantin Fedotov Close issue)
