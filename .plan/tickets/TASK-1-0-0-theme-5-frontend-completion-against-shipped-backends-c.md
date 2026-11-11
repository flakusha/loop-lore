<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 5: Frontend completion against shipped backends (contract-hardened)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Rationale: Cheapest user-visible wins are UI over already-wired backends (age-gate: routes+hot-reload+migrations shipped, UI absent). The 23-epic frontend matrix is still Proposed/design-stage, and parked UI branches (battle, world-mgmt, a11y, nsfw, story-mode) risk colliding — sequence behind the finalize wave with the API-contract gate green.

Feeds: epic-priority-analysis §B1/C1 (age-gate); matrix-frontend-backend-integration (23 epics, contract gate); matrix-cross-mechanics §0.1.0 alignment (NSFW x chat, gallery x chat, assistant-tooling x wizards, memory+template x chat); next-epic-selection §2(d) collision warning; parked branches per receipt

AC6 Frontend completion: age-gate UI enforced against the shipped backend (minor flow blocked without birth_date/acceptance); API-contract gate green across the 23-epic frontend surface; no parked-branch file collisions at landing.

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Required gallery/search/frontend-completion items (UI over shipped backends).

**Caveats:** TOCTOU: age-gate status checked at send time, not render time. Security: age-gate enforcement is server-side; UI is display only. Authorization: admin surfaces keep requirePermission gates. Parallelism: contract-gate tests scan static files, no shared state. Partial failure: failed landing rebases, never force-pushes. Rollback: UI-only slices revert without migration changes. Observability: contract-gate violations fail the check with file:line.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
