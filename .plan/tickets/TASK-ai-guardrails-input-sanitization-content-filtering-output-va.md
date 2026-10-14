<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AI guardrails: input sanitization, content filtering, output validation, safety scoring

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

epic-api-validation-guardrails.md:114-119 lists sanitizer, content filter, output validator, safety scorer, and guardrails dashboard as unchecked. Only src/validation/prompt-injection.ts exists.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Input sanitizer wired at the validation boundary (define escaping/allow-list policy).
- [ ] Content-filter + output-validator modules with unit tests (happy + negative paths).
- [ ] Safety-scoring hook producing a numeric score consumed by the pipeline.
- [ ] Guardrails dashboard surface (or explicit deferral recorded in the epic).
- [ ] bun run check green.

**Related:** src/validation/prompt-injection.ts
