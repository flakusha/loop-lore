<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Correct dead file references and store shape drift in the instance switcher spec

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

docs/spec/federation-instance-switcher.md points at two files that do not exist: src/views/partials/top-bar.html (:180) and src/frontend/alpine/command-palette.ts (:182). Real integration points: the persistent sidebar in src/views/layout.html:65-238 (only #app-root swaps at :295-304, so the sidebar survives htmx swaps), and the notification-bell Alpine dropdown at src/views/layout.html:252-292 as the working precedent for a global always-mounted dropdown. The #header-slot at :249 is oob-swapped per page and is a BAD host - tests/e2e/flows/browser/navigation.browser.ts:143-144 asserts it is unique. The spec's federationStoreFactory shape also does not fit the store registry, which maps name to initial value, not a factory (src/frontend/stores/index.ts:10-33). Fix the spec text; do not re-scope the switcher itself. Acceptance: every src/ path named in the spec exists; the store section describes the registry's actual name-to-initial-value contract; the spec states that a new module is added to an existing bun build entry (scripts/build-frontend.mjs:22-62), not a new bundle.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
