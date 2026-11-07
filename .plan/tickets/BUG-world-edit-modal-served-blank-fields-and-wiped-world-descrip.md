<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: World edit modal served blank fields and wiped world description/lore

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-world-management-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Symptom: the world-detail page's Edit button opened a modal whose name/description/lore fields were all blank. Saving it silently wiped the world's description and lore.

Root cause: the Edit button loaded a STATIC, DB-less partial (src/partials/worlds/edit-modal.html) through the GET partials route (src/routes/views/plugin-static.ts:12-27 -> src/routes/views/static-partials.ts:14-35), which never resolves includes and never reads the world row - the input at :26 carried no value and the textareas at :31-39 and :48-56 were empty, and the text-toolbar includes at :41 and :58 were rendered verbatim. The form PUT to the world update route (src/partials/worlds/edit-modal.html:17) with those empty fields, and the handler writes any non-null field, so description and lore were overwritten with empty strings.

Fix: delete the broken duplicate partial. The canonical edit surface is the full-page editor at the world's edit page (src/routes/views/plugin-pages.ts:115-131 -> src/routes/views/view-serving.ts:142-159), which prefills name/description/lore from GET api v1 worlds by id (src/frontend/alpine/world-edit.ts:46-84) and saves the same fields intact. The world-detail Edit action becomes a plain anchor to the world's edit page (src/views/world-detail.html), keeping data-testid "edit-world"; the now-unreachable world:saved listener in src/frontend/alpine/htmx.ts and its tests are removed. This matches the documented design (docs/frontend/worlds.md:131,136).

Verification: bun test src/routes/views and bun test src/frontend/alpine/htmx.test.ts green; typecheck, eslint, dprint and size gates green; a regression test asserts the served world-detail page exposes the edit action pointing at the world's edit page and no longer references the deleted partial.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
