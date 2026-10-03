<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Classifier-role fallback policy in callAux

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

VALID_ROLES already includes Classifier (src/admin/model-roles.ts) but resolveModelRole(ModelRole.Classifier) has zero production callers; every hook hardcodes auxiliary. Add a classifier-before-auxiliary fallback to the callAux role option (src/aux-pipeline/types.ts AuxCallOptions.role, runner.ts:59 default), mirroring caption-route captioning-to-main fallback, so AUX tasks can migrate to encoder classifier models task-by-task once FEAT-classifier-model-support lands.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
