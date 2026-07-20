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

| Task                            | Title                             | Priority | Status      |
| ------------------------------- | --------------------------------- | -------- | ----------- |
| TASK-regex-extraction-tests     | Regex to constants + unit tests   | Medium   | Not Started |
| TASK-thinking-tag-context-prune | LLM `<think>` tag context pruning | Medium   | Not Started |

## Metrics

- ESLint errors: 0 (target)
- ESLint warnings: tracked but non-blocking
- Cognitive complexity cap: `warn` (intentional until oversized handlers split)
- Type safety: `any` usage minimized

## Files

- `eslint.config.mjs` — ESLint configuration
- `.agents/references/banned-patterns.md` — banned patterns
- `.agents/references/recommendations.md` — recommended patterns

## Analysis & Current State (2026-07)

Grounded against `eslint.config.mjs` and `docs/meta/code-practices-improvements/01-strict-typing.md` + `02-eslint-and-static-analysis.md`.

**Already implemented (from 02 recommendations):**

- `sonarjs/cognitive-complexity: ["warn", 20]` — present but **warn**, not error (intentional until oversized handlers split).
- `import/no-cycle: ["error", { maxDepth: 1 }]` — present.
- `@typescript-eslint/consistent-type-definitions: ["error", "interface"]` — present (enforces AGENTS.md convention).
- `@typescript-eslint/no-misused-promises: "error"` — present (server block).
- `no-restricted-syntax` bans `.map/.filter/.reduce/.flat*` and bare `JSON.parse/stringify` — strong opinionated guardrail.

**Remaining gaps (from 01/02, NOT yet done):**

- `@typescript-eslint/no-explicit-any` is **OFF** in `src/` (deliberate: DB dialect wrapper `as any[]` in `src/db/index.ts`, frontend Alpine/htmx `any`-typed globals). Needs localized, documented escape hatch + audit before flipping to error.
- `no-floating-promises` is **OFF** across all blocks — latent unawaited-promise bugs in async middleware/derive callbacks.
- Frontend `tsconfig.frontend.json` weaker than backend: missing `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `noImplicitOverride`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`.
- `exactOptionalPropertyTypes` + `noPropertyAccessFromIndexSignature` not enabled — diverges from Kysely `Generated`/`Nullable` semantics.
- `type-coverage` floor is 85%, not 100% — long tail of `any` permitted.
- `eslint-plugin-import-x` / `eslint-plugin-perfectionist` not adopted — no import/export sorting, no orphaned-module detection.

## Extended Scope / Candidate Tasks

| Task                          | Title                                                                                         | Priority | Status      |
| ----------------------------- | --------------------------------------------------------------------------------------------- | -------- | ----------- |
| TASK-no-explicit-any-audit    | Audit + localize `any` (DB wrapper, frontend globals); flip `no-explicit-any` to error in src | High     | Not Started |
| TASK-no-floating-promises     | Enable `no-floating-promises: error` after fixing async derive/middleware                     | High     | Not Started |
| TASK-frontend-tsconfig-parity | Align `tsconfig.frontend.json` with backend strict flags                                      | High     | Not Started |
| TASK-exact-optional-types     | Enable `exactOptionalPropertyTypes` + `noPropertyAccessFromIndexSignature`                    | Med      | Not Started |
| TASK-complexity-to-error      | Promote `cognitive-complexity` 20 warn → error after handler splits                           | Med      | Not Started |
| TASK-type-coverage-90         | Raise `type-coverage` floor 85 → 90 (then 95 → 100 per PR)                                    | Med      | Not Started |
| TASK-import-x-perfectionist   | Adopt `eslint-plugin-import-x` + `perfectionist` (order/sort, unused-modules)                 | Low      | Not Started |

## Open Questions

1. Should `no-explicit-any` stay off for the DB dialect boundary permanently, or be replaced by a single documented `// @ts-expect-error` + `SqliteBindings` union (per 01 rec #4)?
2. Is `cognitive-complexity: 20` the right ceiling, or tighten to 15 once `generate-route.ts` (66) / `openai-compatible.ts#stream` (96) are split?
3. Frontend parity vs. pragmatism: how far should `tsconfig.frontend.json` tighten before it fights Alpine/htmx glue?
4. Should type-coverage be raised as a hard PR gate now, or only a tracked metric to avoid flag-day?

## Research / References

- `docs/meta/code-practices-improvements/01-strict-typing.md` — full gap analysis + steps
- `docs/meta/code-practices-improvements/02-eslint-and-static-analysis.md` — rule recommendations
- typescript-eslint v8 rules: `no-explicit-any`, `no-floating-promises`, `consistent-type-definitions` (https://typescript-eslint.io/rules/)
- `eslint-plugin-import-x` (https://www.npmjs.com/package/eslint-plugin-import-x), `eslint-plugin-perfectionist` (https://www.npmjs.com/package/eslint-plugin-perfectionist)

## Related Epics

- **Epic Testing & QA** — the type-coverage (85%) and cognitive-complexity gates are enforced in `bun run check`, which QA owns; raise-floor tasks here feed QA metrics.
- **Epic Tooling Improvement** — lint/format toolchain (ESLint-centric vs Biome) is shared ownership; see its formatter-drift caution.
