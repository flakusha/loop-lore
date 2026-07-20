# EPIC: Code Quality & Best Practices (Permanently Ongoing)

**Status:** 🟡 Permanently Ongoing
**Priority:** High
**Effort:** Continuous
**Type:** Ongoing Epic

## Summary

ESLint improvements, good practices and patterns enforcement. Continuously improve code quality, enforce patterns from `.agents/references/banned-patterns.md` and `recommendations.md`.

## Scope

- ESLint rule additions and refinements
- Pattern enforcement (banned patterns, recommendations)
- Code review automation
- Static analysis improvements
- Type safety enhancements
- Refactoring for maintainability

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| TASK-regex-extraction-tests | Regex to constants + unit tests | Medium | Not Started |
| TASK-thinking-tag-context-prune | LLM `<think>` tag context pruning | Medium | Not Started |

## Metrics

- ESLint errors: 0 (target)
- ESLint warnings: tracked but non-blocking
- Cognitive complexity cap: `warn` (intentional until oversized handlers split)
- Type safety: `any` usage minimized

## Files

- `eslint.config.mjs` — ESLint configuration
- `.agents/references/banned-patterns.md` — banned patterns
- `.agents/references/recommendations.md` — recommended patterns
