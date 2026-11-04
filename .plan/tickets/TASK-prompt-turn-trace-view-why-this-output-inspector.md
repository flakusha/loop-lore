<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Prompt/turn trace view (why-this-output inspector)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** observability, prompt-inspector, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Builder-mindshare bet (research 01 proxy 3: Lumina/time-travel-debugging signal) + ST prompt-itemization (research 06: per-category token breakdown graph, TokenHandler per-component counts). Gap: no why-did-the-model-do-that view — turn trace backed by aux-pipeline judge trail + per-section token breakdown in chat UI. Research: .tmp/research/ai-cheat/01-outside-takes.md gaps 6-7, 06-observability-sandbox.md ST section.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
