<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Dead ESLint stub rules and a dead response schema on the dynamic routes

**Status:** Not Started
**Priority:** Low
**Effort:** Medium

**Summary:**

Two low-severity dead-configuration findings from the step-5 review, both verified still present.

1. eslint.config.mjs:459-489 defines stubs for six unicorn rules (name-replacements, consistent-boolean-name, prefer-string-replace-all, prefer-switch, no-lonely-if, import-style) plus sonarjs/no-os-command-from-path, all set off, for scripts/**/*.mjs. A repo-wide grep for eslint-disable comments naming any of them returns zero real hits — only generated files under docs/.vitepress. The block is 32 lines of config a reader has to take on faith; a bare plugins entry enables no rule and the rules map only turns stubs off.

2. src/validation/schemas/primitives.ts:166 defines SuccessResponse as an object with a data field. All eleven /dynamic/* handlers (src/routes/views/plugin-dynamic.ts:40,56,66,83,94,110,121,132,147,157,167) declare response: { 200: SuccessResponse } yet return a raw Response, which Elysia skips validating. The declared contract promises { data: ... } while the JSON branch emits a characters-grid view model. Nothing breaks; the contract is simply false. Flagged for the API-contract epic rather than patched opportunistically.

Leave eslint.config.mjs:322-327 alone: it is owned by TASK-frontend-banned-pattern-ownership-comment-claims-eslint-enfo and editing it here would collide.

Source: .tmp/step-5/repository-review.md F4 and F5.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
