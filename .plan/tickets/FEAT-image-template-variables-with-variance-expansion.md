<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Image template variables with variance expansion

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-image-prompt-templating

**Summary:**

Declared variables on ImageTemplatePayload (mirroring WorkflowPayload.parameters, incl. the token-consistency rule) validated at serializeTemplateInput and in handleImageGeneration; {a|b} alternation expansion at render time in applyImageTemplate post-substitution; seed-deterministic per-item PRNG keyed (seed, template id, variable map, item index); full backend resolution before any provider call — no unresolved variance syntax reaches a provider (sdcpp has no native wildcard support); per-batch-item dispatch so batch items get distinct resolved prompts; lint: declared-vs-used tokens, unbalanced/nested braces (v1 flat only), | inside {{var}} not a separator, empty alternatives rejected; unknown-variable empty-render contract revisited (missing required variable must not silently render empty at dispatch).

**Context:**

Today `ImageTemplatePayload` is a bare `templateBody`; unknown `{{tokens}}` silently render empty (`apply.ts`) and the declared-parameter rule exists only for workflows. This ticket adds declared variables plus `{a|b}` variance expansion to the image-template render path.

**Related:** FEAT-image-prompt-template-packs (pack templates carry variables/variance consumed at selection time)

**Acceptance Criteria:**

- [ ] `ImageTemplatePayload` declares `variables` mirroring `WorkflowPayload.parameters` (including the token-consistency rule)
- [ ] Validation runs at `serializeTemplateInput` and in `handleImageGeneration`
- [ ] `{a|b}` alternation expansion happens at render time in `applyImageTemplate` AFTER `{{var}}` substitution
- [ ] Per-item PRNG is seed-deterministic, keyed (seed, template id, variable map, item index)
- [ ] Variance fully resolves in the backend before any provider call; no unresolved variance syntax reaches a provider (sdcpp has no native wildcard support)
- [ ] Batch dispatch is per-item: each batch item gets its own resolved prompt
- [ ] Lint: declared-vs-used tokens, unbalanced/nested braces (v1 flat only), `|` inside `{{var}}` not a separator, empty alternatives rejected
- [ ] Missing required variable no longer silently renders empty at dispatch (unknown-variable contract revisited)
- [ ] Tests cover substitution, variance expansion, determinism, lint, and batch per-item dispatch
