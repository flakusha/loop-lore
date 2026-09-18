<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gallery search/filter + RAG feedback loop

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-frontend-gallery.md
**See also:** epic-gallery-batch-operations.md
**Status:** Open
**Priority:** High

## Scope

- Search/filter bar: text query, tag facets, type/size/date filters,
  saved filters; paginated fast results with request time cap
  (global/admin/user-configurable per prior search/RAG analysis).
- Feedback loop: accept/dismiss on tag propositions + explicit
  result-relevance signal feed back into RAG ranking context; homepage
  documents the loop, implementation lands per search epic.
- Empty/no-result states + loading skeletons per gallery conventions.

## Acceptance

- Filtered search paginates under the configured time cap.
- Dismissed proposition measurably suppresses re-suggestion (logged).
