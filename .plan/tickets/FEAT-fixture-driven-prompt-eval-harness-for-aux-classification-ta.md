<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Fixture-driven prompt-eval harness for AUX classification tasks

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:**

No eval harness exists for the 10 AUX classification prompts; unit tests assert call contracts via makeAux stubs, never behavioral correctness. Add tests/fixtures/prompt-eval per task (input messages plus expected label), a runner (bun run eval:prompts) that executes the classifier functions against a recorded or local provider, reports per-task accuracy and parse-null rate, and fails on regression vs a stored baseline. Wire as an isolated, skip-by-default check gate so CI runs it only when a model endpoint is configured.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-04 registry-driven close: git issue 5fe4c12 (registry tip: 12ab43ce0 Konstantin Fedotov Close issue)
