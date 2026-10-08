<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Widen typecheck coverage to plugins/ and tests/

**Status:** Not Started
**Priority:** medium
**Epic:** epic-benchmark-ci-regression
**Effort:** Medium

**Summary:**

**Problem.** Three tsconfig projects run in the gates, and between them they cover `src/**`, `src/frontend/**`, and `scripts/worktree/**`. Two whole trees have **no** typecheck gate: `plugins/` (the shipped, user-installed plugin code) and `tests/` (including e2e helpers). A type error in either cannot fail the gate.

**Evidence.** What actually runs:
- `tsconfig.backend.json:26` — `"include": ["src/**/*"]`, `:27` excludes `src/frontend/**/*`. Run by `typecheck` and `typecheck:coverage` (package.json:52,56).
- `tsconfig.frontend.json:28-30` — `"include": ["src/frontend/**/*"]`. Run by `typecheck:frontend` and `typecheck:coverage:frontend` (package.json:54,57).
- `tsconfig.scripts.json:10` — `"include": ["scripts/worktree/**/*.ts"]`. Run by gate `typecheck - scripts` → `bunx tsgo --noEmit -p tsconfig.scripts.json` (`scripts/check/parallel/gates.mjs:45`), included in `check:fast` (package.json:65).
- `check:typecheck` (package.json:61) = backend + frontend + both coverage variants. None of the five touch `plugins/` or `tests/`.

`tests/` looks covered but is not: `tsconfig.json:7` does `"include": ["src/**/*", "tests/**/*"]`, but **no gate ever runs `tsconfig.json`** — its only consumers are the madge cycle checks (package.json:84-86), which are graph checks, not type checks. Verified with `grep -rn "tsconfig.json" scripts/`: the only typecheck invocations name `tsconfig.backend.json`, `tsconfig.frontend.json`, and `tsconfig.scripts.json`.

Shipped plugin code that is affected, e.g. `plugins/community/nsfw-cards/plugin.ts` (imports `./engine` and `../../../src/routes/http-utils` across the plugin→backend boundary) — a signature change in `src/routes/http-utils` breaks this file with no gate noticing.

**Impact.** `plugins/` is the weakest-covered code the project ships, and it is exactly the surface taking new security work — route declarations, tool definitions, and access-control fields. `tests/` has the same hole, so e2e helpers drift against the routes they drive and the failure surfaces at run time rather than in the gate.

**Fix direction.** Add a project covering `plugins/**/*` and one covering `tests/**/*` (or extend `tsconfig.scripts.json` and add both to `check:typecheck`, package.json:61). Expect real errors on first run — budget for the fix-up, and decide per-tree whether to inherit the strict backend settings or the relaxed ones `tsconfig.scripts.json:4-7` uses. Note that `tsconfig.backend.json` has `noUnusedLocals`/`noUnusedParameters`/`noUncheckedIndexedAccess` on (`:20-23`), so a strict plugin project will flag existing debt.

**Verification.** Introduce a deliberate type error in a file under `plugins/` and one under `tests/`; `bun run check:typecheck` must fail for both.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
