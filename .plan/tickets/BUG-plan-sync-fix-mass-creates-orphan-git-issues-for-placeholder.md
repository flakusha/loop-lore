<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: plan:sync --fix mass-creates orphan git issues for placeholder hashes

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

When --fix encounters entries whose .md file is missing (phantom index entry), it calls  with the ticket title. Closing the orphaned issue causes --fix to spawn a NEW orphan with a different hash on the next run. Observed in session-2026-09-03: 6+  issues spawned (, , , , …) — none with a real .md source. Source: scripts/sync-ticket-index.ts:252-271 (placeholder-hash auto-create). Fix: skip auto-create when entry.source file is missing; instead warn that the .md must be restored before --fix can register a git_issue.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
