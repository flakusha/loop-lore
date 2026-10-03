<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Route text moderation and prompt-injection verdicts through the classifier role

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:**

moderation-classifier.ts and prompt-injection step 2 already thread AuxCallOptions through callAux. Pass role classifier with auxiliary fallback so verdicts can ride zero-shot NLI encoder models (bart-large-mnli class) served via llama.cpp or transformers.js without touching prompt plumbing. Depends on the classifier-role fallback policy in callAux.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-03 registry-driven close: git issue 204dfb3 (registry tip: b4309cecf Konstantin Fedotov Close issue)
