<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: GitHub workflows and CI fixes (bun migration, dependabot, GPG)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

CI failures: commit-check rejects Revert commits; dependabot misconfigured as npm (should be bun); release workflow requires .credentials.env (GPG precheck). .github actions should use bun, not node. From Research-github-workflows.md.

**Context:**

CI currently assumes GPG credentials that CI runners do not necessarily have, checks Dependabot under the wrong ecosystem, and rejects valid git-generated revert subjects. This update scopes the existing ticket without changing its title: set or safely bypass the GPG precheck on CI gates, switch Dependabot to Bun, and accept `Revert "..."` first-line commit shapes.

**Acceptance Criteria:**

- [ ] CI gates do not abort on a missing local GPG credential expectation.
- [ ] Dependabot uses the repository's Bun ecosystem.
- [ ] `commit-check` accepts git-generated `Revert "..."` subjects that are otherwise valid.
- [ ] Relevant checks pass.
