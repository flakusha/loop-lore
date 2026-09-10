<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Apply JSDoc across src/ to satisfy jsdoc/require-{param,returns,throws}

**Status:** ⏳ In Progress (partial — 227 of 2647 files done)
**Priority:** medium
**Effort:** Large (2-3 batches)

## Summary

After lifting `jsdoc/*` rules to error in `eslint.config.mjs`, **2647 violations across 874 hand-edited files** in src/ under the real ESLint config. One partial commit (`baf5692`) fixed 227 files. **2420 errors remain** as of this ticket.

## What's done

- `eslint.config.mjs`: `jsdoc/require-{param,returns,throws}` flipped to `error` (commit `c6dea088`)
- `AGENTS.md`: JSDoc convention updated to minimal policy with `@throws` mandate (commit `c6dea088`)
- **227 files** in `src/assets/`, `src/assistant/`, `src/auth/`, `src/aux-pipeline/`, `src/battle/`, `src/characters/`, `src/chat/`, `src/config/`, `src/content/`, `src/crypto/`, `src/db/`, `src/group-chat/`, `src/hash/`, `src/i18n/`, `src/image-edit/`, `src/inference/`, `src/async/`, `src/cron/` got minimal JSDoc (commit `baf5692`)

## What failed (cautionary)

- **Sonic subagent with Python fixer script** broke 347 files in `src/routes/` and `src/rpg/` by injecting `@returns` text into the middle of JSDoc blocks (the `*/` close marker was found by string search, not line-based, and matched `*/` inside string literals in function bodies). All 347 files were restored via `git checkout HEAD`. Subagent claim of "0 errors remaining" was false — the script only ran on a subset and didn't include the restoration step in the success path.
- **Sonic subagent reporting** proved unreliable: 2 of 2 agents reported "0 errors remaining" in their slice when the actual counts were 305 and 679.

## Approach for remaining work

1. **No more script-based codemods** — the `*/` matching problem proves line-agnostic regex injection is unsafe. Use line-based parsing or per-file manual edits only.
2. **Add `@throws {Error} When <condition>`** on functions whose body throws, returns `Result.err`, or rejects a Promise.
3. **Add `@returns`** only when non-obvious from signature.
4. **Add `@param`** only when name clarifies.
5. **Keep blocks ≤3 lines** (per AGENTS.md).

## Already exempted in eslint.config.mjs (do NOT add JSDoc here)

- `src/db/schema*.ts` (20 generated files)
- `src/db/schema.ts`, `src/db/schema-manifest.ts` (explicit)
- `src/validation/db-schemas.ts` (generated)
- `src/test-utils/insert-helpers.ts` (generated)
- `src/**/*.test.ts` + `src/**/*.integration.test.ts` (test files)

## Remaining 2420 errors — per-directory breakdown

| Errors | Directory | Notes |
|---|---|---|
| 519 | routes | Largest remaining. Routes modules with many request handlers. |
| 385 | rpg | RPG subsystem. Service-layer functions. |
| 312 | frontend | Alpine.js + htmx code. Many small type/utility files. |
| 232 | generation | Provider classes with methods. |
| 132 | story | Story game-master, items, events. |
| 95 | middleware | Auth/rate-limit/NSFW gate. |
| 65 | characters | Already partially done (165 → 65) — 100 more to go. |
| 64 | services | Service-layer modules. |
| 55 | image-edit | Image edit providers/routes. |
| 54 | federation | Federation/coordinator/envelope. |
| 45 | nsfw | NSFW service. |
| 39 | transport | Transport layer. |
| 32 | utils | Utility modules. |
| 28 | config | Config modules. |
| 28 | turning | Turn orchestration. |
| 26 | assets | Already partial. |
| 25 | logger | Logger module. |
| 24 | chat | Already partial. |
| 22 | validation | Validation schemas. |
| 20 | crypto | Already partial. |
| 20 | memory | Memory service. |
| 18 | notifications | Notification service. |
| 16 | plugins | Plugin registry. |
| 14 | server | Server entry. |
| 13 | scripts | Build scripts. |
| 12 | personas | Persona service. |
| 11 | prompt-improve | Prompt improvement. |
| 11 | test-utils | Test helpers. |
| 11 | tui | TUI code. |
| 10 | async | Async utilities. |
| 10 | cron | Cron module. |
| 10 | i18n | i18n service. |
| 9 | db | Mostly hand-edited (state.ts etc). |
| 8 | assistant | Already partial. |
| 6 | telemetry | Telemetry service. |
| 5 | battle | Already partial. |
| 5 | content | Already partial. |
| 5 | utils.ts | Top-level utils. |
| 4 | group-chat | Already partial. |
| 4 | seeding | Seeding service. |
| 3 | rag | RAG service. |
| 2 | profanity, regex, schemas, search | Long tail. |
| 1 | auth, aux-pipeline, elysia-app.ts, hash, inference | Singles. |

## Suggested 3-batch plan (each = separate worktree)

Each batch must use **per-file manual edits via `mcp__lean_ctx_ctx_patch`** — no script-based codemods. Subagents MUST verify their work via `npx eslint <scope> --format json` and report 0 errors before claiming completion.

- **Batch A — Big-bucket routes/rpg/story/services** (~1100 errors, 4 dirs): `routes/`, `rpg/`, `story/`, `services/`
- **Batch B — Front/generation/middleware** (~640 errors, 3 dirs): `frontend/`, `generation/`, `middleware/`
- **Batch C — Long tail** (~680 errors, 30+ dirs): everything else in the table above

## Acceptance criteria

- [ ] All 2420 remaining jsdoc violations resolved
- [ ] Each modified file remains under 200 lines (AGENTS.md file size rule)
- [ ] No `bun run check` regressions on unrelated gates
- [ ] Subagent verification step (`npx eslint <scope> --format json` returns 0 errors) included in every batch's completion report

## Hard rules for future batches

1. **No script-based codemods** — line-agnostic regex injection on TypeScript source is unsafe.
2. **Subagent verification is mandatory** — every subagent MUST run `npx eslint <their-scope> --format json` and confirm 0 errors before claiming success.
3. **Restore step in the success path** — if a subagent's edits break any file, the restore (`git checkout HEAD -- <files>`) MUST run before claiming completion.
4. **Per-directory scope is disjoint** — subagents must not touch files outside their assigned directories.
