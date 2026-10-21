<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Journal keyphrase panel reads only page 1 of the paginated memories envelope

**Status:** Done
**Priority:** low
**Effort:** Small
**Tags:** frontend

**Summary:**

src/frontend/pages/characters-journal-keyphrases.ts:73-77 fetches /api/v1/actors/{id}/memories with no page parameters and reads body.data once; the endpoint paginates (default pageSize 50). Characters with more memories get a silently truncated keyphrase list with no more-affordance; prompt-side recall is unaffected (it scans the DB directly). Fix: request the max pageSize for this panel or loop until pagination.totalPages is exhausted.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
