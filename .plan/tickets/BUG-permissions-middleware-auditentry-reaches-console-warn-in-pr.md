<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: permissions middleware auditEntry reaches console.warn in production

**Status:** Done
**Priority:** Medium
**Effort:** Medium

**Summary:**

`src/middleware/permissions.ts:118` emits `console.warn("Permission denied", auditEntry)`
as a fallback when the structured logger is unavailable. The `auditEntry` object
contains request identifiers and role context. In production environments where
stdout is captured by a log aggregator, structured audit metadata can reach
external log sinks.

## Evidence

`src/middleware/permissions.ts:117-118`:

```ts
  } catch {
    /* eslint-disable-next-line no-console */
    console.warn("Permission denied", auditEntry);
  }
```

The catch block is reachable when `getLogger()` itself throws — meaning
`auditEntry` can reach stdout even after logger init has succeeded and failed.

## Source

- review-security.md P1 finding 2
- review-consolidated.md nit 8
- File:line: `src/middleware/permissions.ts:118`

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue fea5a8b (registry tip: 986b6f2af Konstantin Fedotov Auto-closed: appended .md marker marks BUG-PERMISSIONS-MIDDLEWARE-AUDIT)
