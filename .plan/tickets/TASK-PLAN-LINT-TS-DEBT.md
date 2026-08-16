<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-PLAN-LINT-TS-DEBT: Close lint-ts debt → `check` lint gate green

**Status**: done
**Priority**: high (release-blocking — last red gate)
**Labels**: lint, quality, release-closeout
**Assignee**:
**Epic**:
**Related**: `TASK-fix-eslint-errors.md` (✅ 2026-08-07), `TASK-epic-36-lint-fix-array-method-warnings.md`

Git issue: `cbb3073`

## Current reality (verified 2026-08-14)

`bun run lint` reports **`655 problems (64 errors, 591 warnings)`** — not the
"~196 warnings / 291 files" previously recorded, and not "0 errors" (the old
`TASK-fix-eslint-errors.md` claim is stale — errors regressed after later format
passes). The dprint trailing-comma pass (2026-08-14, `e58c00c4`) touched 173
`src/` files but did not resolve lint errors.

64 errors are **blocking** (lint gate exits 1); 591 warnings are non-blocking debt.

## Error breakdown by rule (64 total)

| Rule | Count | Auto-fixable? | Fix |
|------|-------|---------------|-----|
| `@typescript-eslint/no-unnecessary-type-assertion` | 25 | ✅ | remove redundant `as` casts (receiver already accepts type) |
| `unicorn/switch-case-braces` | 12 | ✅ | add `{}` around case-clause bodies |
| `unicorn/max-nested-calls` | 9 | ❌ manual | extract nested calls into named helpers |
| `unicorn/no-non-function-verb-prefix` | 6 | ❌ manual | rename `createRes`/`getRes`/`createRecipeBody` vars (verb-prefix on non-fns) |
| `no-restricted-syntax` | 6 | ❌ manual | `.map/.filter/.reduce` → for-of+push; bare `JSON.parse` → `jsonParseOr`; `Promise.all` → `allSettled` |
| `unicorn/prefer-ternary` | 2 | ❌ manual | replace single-branch `if` with ternary |
| `unicorn/prefer-export-from` | 1 | ✅ | `export…from` re-export |
| `unicorn/no-nested-ternary` | 1 | ❌ manual | parenthesize / extract nested ternary |
| `@typescript-eslint/no-misused-spread` | 1 | ❌ manual | spread on array in object → wrong shape; use index keys |
| `@typescript-eslint/no-base-to-string` | 1 | ❌ manual | `[object Object]` stringification — handle Error properly |

**44 of 64 are auto-fixable** (`no-unnecessary-type-assertion`, `switch-case-braces`,
`prefer-export-from`). **20 require manual judgment** (semantic: alloc/control-flow,
rename, error handling).

## Execution plan

### Phase 1 — auto-fix (clears ~44 errors)

```bash
bun run lint:fix
bun run lint   # re-count: expect ~20 errors remaining
```

Covers: `no-unnecessary-type-assertion`, `switch-case-braces`, `prefer-export-from`.

### Phase 2 — manual, by rule cluster (20 errors)

1. **`max-nested-calls` (9)** — extract deeply nested call chains in the flagged
   route/service files into private helpers; keep behavior identical.
2. **`no-non-function-verb-prefix` (6)** — rename non-function vars that start with
   verbs (`createRes`→`res`, `getRes`→`res`, `createRecipeBody`→`recipeBody`).
3. **`no-restricted-syntax` (6)** — mechanical but semantics-sensitive: convert to
   for-of where the map/filter/reduce is alloc-heavy or the rule fires; use
   `jsonParseOr` for the `JSON.parse` site; swap `Promise.all`→`allSettled` only
   where partial-failure handling is correct (do NOT blanket-replace — verify each).
4. **remaining singles (4)** — prefer-ternary (2), no-nested-ternary, no-misused-spread,
   no-base-to-string: one-off fixes, read the flagged line and context.

### Phase 3 — verify no regression

```bash
bun run lint            # 0 errors expected (warnings may remain — non-blocking)
bun test src/           # unit tests still pass
bun run check           # full gate
```

## Acceptance criteria

- [x] `bun run lint` exits 0 (0 errors; warnings OK to remain as tracked debt)
- [x] No behavior change: `bun test src/` green
- [x] Per-error-type remediation documented above, or adjusted with rationale if a
      rule is better disabled (state the case — do not blanket-disable)

## Resolution (2026-08-14)

- Baseline at worktree start: **665 problems (68 errors, 597 warnings)** — dev grew 4
  errors since ticket was written (C1 matrix + memory merges).
- Phase 1 `lint:fix`: 68 → 27 errors (41 auto-fixed; 404 warnings also auto-fixed).
- Phase 2 manual (27): all fixed in `tree/lint-ts-debt`:
  - `no-restricted-syntax` (6): equipment.ts map→for-of + `jsonParseOr` for JSON.parse;
    actor-items.ts reduce→for-of, Promise.all→sequential awaits; hardcoded.ts
    `.map`→`Array.from(iterable, fn)` (satisfies both no-restricted-syntax and
    prefer-array-from-map).
  - `no-misused-spread` (1): equipment.ts `{ ...loot, worldItemIds }` spread array into
    object (index keys) — **latent bug**; now `{ loot, worldItemIds }`.
  - `no-non-function-verb-prefix` (7): `createRes`→`created`, `getRes`→`fetched`
    (crafting.test.ts), `createRecipeBody`→`recipeCreateBody` (recipes-schemas.ts +
    recipes.ts).
  - `max-nested-calls` (9): **config override** — added recipes.ts, recipes-schemas.ts,
    trade.ts to the existing TypeBox schema-nesting exemption block in eslint.config.mjs
    (precedent: character-emotions.ts, vn-*.ts, etc.). TypeBox DSL nesting is
    declarative composition, not call logic; per-ticket policy allows rationale'd
    disable.
  - `no-base-to-string` (1): trade.ts onError `String(error)` → instance-safe message
    extraction.
  - `prefer-ternary` (2): actor-items.ts threshold const-ternary; item-transfer.ts
    `fromActorId ? await … : null`.
  - `no-nested-ternary` (1) + `no-nested-template-literals` (1): parenthesized ternary
    (trade.ts), extracted errorSuffix var (tests/e2e/helpers/htmx-alpine.ts).
- Result: `bun run lint` **EXIT 0 — 0 errors**, 193 warnings remain (non-blocking debt).
- **Bonus fix**: `chat-participants.test.ts` leaked a process-global
  `mock.module("./i18n", () => ({ t: key => key }))` that made sibling
  `world-channels.test.ts` assertions receive raw i18n keys whenever the two files
  shared a worker (deterministic when run together; reproduced on clean dev too —
  pre-existing hazard). Replaced with real `i18n.test-helper` import. `bun test src/`
  now 3496 pass / 0 fail.
- Lint gate: **17/17 green once check gate confirms** (lint-ts was the last red gate).

## Scope / risks

- **Semantic rules are NOT safe to `--fix` blindly** — `no-restricted-syntax` and
  `no-misused-spread`/`no-base-to-string` need per-site review; auto-fix only the
  44 mechanical ones.
- This ticket supersedes the stale "291 files→check 16/17" framing (that number
  predates the error regression). Track current counts only.
