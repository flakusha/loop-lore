<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Dynamic gallery search has no visibility filter and no real auth

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

POST /dynamic/gallery/search (src/views/search.ts:31) applies no visibility filtering and no real authentication; the dynamic plugin route plumbing (src/plugins/plugin-dynamic.ts:58-71) does not enforce the standard requireUserId/visibility gates used by the authenticated gallery views - any caller can search across other users' (including hidden/private) assets. Fix: route the dynamic search through the same auth + visibility scoping as the authenticated gallery; add tests proving cross-user/hidden exclusion.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
