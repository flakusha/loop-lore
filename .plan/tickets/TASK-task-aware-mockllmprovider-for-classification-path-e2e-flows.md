<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Task-aware MockLLMProvider for classification-path e2e flows

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:**

tests/e2e mock-llm-provider returns one canned string regardless of task. Extend it to route per-task scripted replies so e2e flows exercise the real NSFW gate, injection step-2 confirm, and intent short-reply path with realistic verdict JSON instead of contract stubs.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-04 registry-driven close: git issue e055c1b (registry tip: 354106dc1 Konstantin Fedotov Close issue)
