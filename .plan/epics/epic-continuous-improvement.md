# EPIC: Continuous Improvement — Lint, TypeCheck, Build, Coverage

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** Medium
**Type:** Improvement Epic

## Summary

Fix `bun run check` failures: ESLint errors (73), TypeScript error (1), stale dist artifact, and test failures (7). Goal: green `bun run check` gate.

## Current State (2026-07-29)

| Gate                  | Status   | Details                                                         |
| --------------------- | -------- | --------------------------------------------------------------- |
| lint - ts             | FAIL     | 73 errors, 839 warnings                                         |
| typecheck - backend   | FAIL     | 1 TS2322 in exporters.test.ts                                   |
| test - unit           | FAIL     | 7 fail, 1 error (2029/2036 pass)                                |
| test - e2e            | FAIL     | 1 fail (no servers available — expected)                        |
| format - dprint       | FAIL     | formatting drift                                                |
| md - lint             | FAIL     | markdown lint                                                   |
| lint - html - scripts | FAIL     | inline script blocks exceed 10L limit                           |
| dist/server.js        | RESOLVED | `dist/` already in `.gitignore`; artifact removed on next build |

## Linked Tasks

| Task                           | Title                                            | Priority | Status      |
| ------------------------------ | ------------------------------------------------ | -------- | ----------- |
| TASK-fix-eslint-errors         | Fix 73 ESLint errors across 16 files             | High     | Not Started |
| TASK-fix-ts2322-exporters-test | Fix TS2322 type error in exporters.test.ts       | High     | Not Started |
| TASK-remove-dist-artifact      | Remove dist/server.js (dist/ already gitignored) | Medium   | Not Started |
| TASK-fix-test-failures         | Fix 7 unit test failures (db schema, mocks)      | High     | Not Started |
| TASK-fix-html-inline-scripts   | Extract inline <script> blocks to frontend TS    | Medium   | Not Started |
| TASK-promote-size-check-to-ci  | Promote check-file-size.ts from warn to CI gate  | Medium   | Not Started |

## ESLint Error Breakdown (73 errors)

### By File (top offenders)

| File                                              | Errors | Key Issues                                      |
| ------------------------------------------------- | ------ | ----------------------------------------------- |
| src/config/load.ts                                | 12     | number-literal-case, numeric-separators-style   |
| .agents/skills/sync-tickets/SKILL.md              | 11     | no-undef (broken code block in markdown)        |
| src/characters/validator.ts                       | 10     | no-unnecessary-type-assertion, for-loop, set    |
| src/routes/export-sse.ts                          | 7      | max-nested-calls, array-type, restrict-template |
| src/rpg/npc-navigation/service.ts                 | 6      | nested-assignment, prefer-group-by              |
| src/routes/views.ts                               | 5      | nested-ternary, prefer-optional-chain           |
| src/routes/model-comparisons.ts                   | 5      | type-conversion, template-expressions           |
| src/rpg/blog/service.ts                           | 4      | nested-assignment, switch-case-braces           |
| src/crypto/key-rotation.ts                        | 4      | type-conversion, switch-case-braces             |
| src/rpg/quests/service.ts                         | 3      | switch-case-braces, no-lonely-if                |
| src/routes/model-comparisons.test.ts              | 3      | number-literal-case, prefer-https               |
| src/rpg/achievements/service.ts                   | 2      | switch-case-braces                              |
| src/config/generate-domain-schemas.ts             | 2      | prefer-group-by                                 |
| src/assistant/prompt/sections/character-traits.ts | 2      | inferrable-types                                |
| src/rpg/integration-registry.ts                   | 1      | no-lonely-if                                    |
| src/config/hot-reload.ts                          | 1      | no-lonely-if                                    |

### By Rule Category

| Rule                                              | Count |
| ------------------------------------------------- | ----- |
| @typescript-eslint/no-unnecessary-type-conversion | 5     |
| unicorn/switch-case-braces                        | 5     |
| unicorn/no-lonely-if                              | 4     |
| unicorn/max-nested-calls                          | 4     |
| @typescript-eslint/array-type                     | 4     |
| unicorn/no-for-loop                               | 3     |
| @typescript-eslint/no-inferrable-types            | 3     |
| @typescript-eslint/no-unnecessary-type-assertion  | 5     |
| unicorn/no-nested-ternary                         | 3     |
| @typescript-eslint/restrict-template-expressions  | 3     |
| unicorn/number-literal-case                       | 2     |
| unicorn/numeric-separators-style                  | 2     |
| no-undef                                          | 7     |
| sonarjs/no-nested-assignment                      | 2     |
| unicorn/prefer-group-by                           | 2     |
| unicorn/no-unused-array-method-return             | 2     |
| @typescript-eslint/prefer-optional-chain          | 1     |
| unicorn/prefer-set-has                            | 1     |
| unicorn/explicit-length-check                     | 2     |
| unicorn/consistent-conditional-object-spread      | 1     |
| sonarjs/no-try-promise                            | 1     |
| sonarjs/no-floating-point-equality                | 1     |
| unicorn/prefer-https                              | 1     |
| unicorn/prefer-continue                           | 1     |
| unicorn/filename-case                             | 1     |
| sonarjs/no-nested-template-literals               | 1     |

## Test Failure Breakdown

| Failure                                  | Root Cause                            |
| ---------------------------------------- | ------------------------------------- |
| character_world_traits table missing     | Test DB schema incomplete             |
| db.updateTable is not a function         | Mock DB missing Kysely method         |
| near "from": syntax error                | Malformed SQL in test                 |
| document.addEventListener not a function | Frontend code in non-browser test env |

## Files

- `eslint.config.mjs` — ESLint flat config
- `tsconfig.backend.json` — backend TypeScript config
- `tsconfig.frontend.json` — frontend TypeScript config
- `package.json` — scripts, build:server
- `dist/server.js` — stale build artifact (3.8MB)
- `.gitignore` — missing dist/ entry

## Acceptance Criteria

- [ ] `bun run lint` passes with 0 errors
- [ ] `bunx tsc --noEmit` passes with 0 errors
- [ ] `bun test src/` passes with 0 failures
- [ ] `dist/server.js` removed (dist/ already in `.gitignore`)
- [ ] `bun run check` passes 15/15 gates
- [ ] Test coverage ≥ 75% statements (maintain current)
- [ ] `check-file-size.ts --strict` integrated into CI gate
- [ ] Bundle size < 260KB total (see `epic-frontend-bundle-optimization`)
