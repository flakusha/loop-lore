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

| Task                            | Title                                              | Priority | Status      |
| ------------------------------- | -------------------------------------------------- | -------- | ----------- |
| TASK-regex-extraction-tests     | Regex to constants + unit tests                    | Medium   | Not Started |
| TASK-thinking-tag-context-prune | LLM thinking tag context pruning                   | Medium   | Not Started |
| TASK-split-messages-route       | Split messages.ts (1013L) into domain modules      | High     | Not Started |
| TASK-split-generate-route       | Split generate-route.ts (736L) into pipeline steps | High     | Not Started |
| TASK-split-config-schema        | Split config/schema.ts (812L) by domain            | Medium   | Not Started |
| TASK-split-server.ts            | Split server.ts (640L) into modules                | Medium   | Not Started |
| TASK-split-utils-god-module     | Break utils.ts god module (~52 importers)          | High     | Not Started |
| TASK-split-logger-god-module    | Break logger/index.ts god module (~59 importers)   | Medium   | Not Started |
| TASK-frontend-bundle-analysis   | Analyze frontend bundle composition                | High     | Not Started |
| TASK-promote-size-check-to-ci   | Promote check-file-size.ts from warn to CI gate    | Medium   | Not Started |
