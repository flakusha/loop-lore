<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# 01 — Strict Typing

## Current state

Backend `tsconfig.backend.json` is already strong:

- `strict: true`
- `noUncheckedIndexedAccess: true` — index signatures return `T | undefined`
- `noImplicitOverride: true`
- `verbatimModuleSyntax: true` — forces `import type` for type-only imports
- `noUnusedLocals` / `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`
- `allowImportingTsExtensions: true` (Bun-native, no build step)
- `paths`: `@/*` → `./src/*`

CI enforces `type-coverage --strict --at-least 95` for both backend and
frontend (`package.json` `typecheck:coverage*`). Backend buffer ~2pp,
frontend buffer <1pp — tight by design. Floor was raised from historical
85% baseline; further raises (e.g. 97% backend) would require either
narrowing `as any` in DB wrapper + plugin loader or per-module overrides.

## Gaps

### 1. Frontend `tsconfig` is materially weaker

`tsconfig.frontend.json` enables only `strict` + a few basics. It is **missing**
`noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitOverride`, `verbatimModuleSyntax`, `forceConsistentCasingInFileNames`
(is set) and `noFallthroughCasesInSwitch`. Frontend code (`src/frontend/**`)
is Alpine/htmx glue with `any`-friendly globals (`Alpine`, `htmx`, `chatState`)
declared in `eslint.config.mjs` — fine for globals, but internal logic gets a
free pass on index-access and unused-symbol bugs that the backend forbids.

### 2. `exactOptionalPropertyTypes` not enabled

Without it, `{ foo?: string }` accepts `foo: undefined`, which silently
diverges from Kysely's `Generated`/`Nullable` semantics and from JSON wire
contracts. This is the single highest-value strictness flag still off.

### 3. `noPropertyAccessFromIndexSignature` not enabled

Object access like `obj[key]` via index signatures is allowed with dot access,
masking typos and missing-key bugs in config/settings maps.

### 4. `any` casts in the DB dialect wrapper

`src/db/index.ts` `createSqliteDialect` casts binding params `as any[]` and
the wrapper interfaces are hand-rolled. This is a pragmatic bridge for Bun's
`bun:sqlite` (which is not a drop-in Kysely `DialectAdapter`), but it means
the most load-bearing data boundary bypasses type-checking. The `as any[]`
should be the _only_ escape hatch and be visibly localized + documented (it is
partially commented, but the union type is wider than necessary).

### 5. `type-coverage` floor is 95%, not 100%

95% permits a long tail of `any`/implicit-`any` in rarely-touched paths.
Raise gradually (97 → 99 → 100) per PR to avoid a flag-day.

**TS7 retest (isolated worktree): type-coverage-core@2.30.1 paired with
typescript@7.0.2 and @typescript/native-preview@7.0.0-dev confirmed broken
at module load.** `type-coverage-core/dist/checker.js:662` references
`ts.SyntaxKind.Unknown` — TS7 removed the legacy alias (was renamed
`UnknownKeyword`, still present in TS7). No upstream fix exists as of
type-coverage-core@2.30.1 (latest published). Additionally,
`typescript-eslint@^8.70` declares `typescript: >=4.8.4 <6.1.0`, blocking
the toolchain end. Resuming TS7 requires both upstream issues to clear;
keep the floor at 95% until they do.

## Recommendations

1. **Align frontend `tsconfig.frontend.json`** with backend: add
   `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
   `noImplicitOverride`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`.
   Keep `lib: [ES2024, DOM, DOM.Iterable]` and `types: ["bun"]`. Re-run
   `typecheck:frontend` and fix the (expected) first-wave errors.
2. **Enable `exactOptionalPropertyTypes: true`** in `tsconfig.backend.json`
   first (highest value, lowest churn), then frontend. Fix the resulting
   `undefined`-assignment sites — most are in settings/config objects.
3. **Enable `noPropertyAccessFromIndexSignature: true`** backend + frontend.
4. **Tighten the DB wrapper**: replace the open `any[]` cast with a
   localized, documented `SqliteBindings` union and a single `// @ts-expect-error
bun:sqlite binding union` at the call site. Consider `kysely-bun` if it
   reaches API stability, to delete the hand-rolled adapter entirely.
5. **Raise `type-coverage` floor** in `package.json` scripts from 85 → 90
   now, and gate PRs to not regress.
6. **Ban `any` at the type level in `src/`** via ESLint
   (`@typescript-eslint/no-explicit-any: error`, already in `strictTypeChecked`)
   — keep the existing test/scripts overrides. Audit remaining `any` (DB
   wrapper, dynamic plugin imports) and convert to `unknown` + narrowing.

## Suggested steps

- Edit `tsconfig.frontend.json` — add the 6 flags above.
- Edit `tsconfig.backend.json` — add `exactOptionalPropertyTypes`,
  `noPropertyAccessFromIndexSignature`.
- Edit `package.json` — `typecheck:coverage*` `--at-least 90`.
- Edit `src/db/index.ts` — narrow the `any[]` cast to a documented union.
- Run `bun run typecheck && bun run typecheck:frontend && bun run typecheck:coverage`
  and triage the first-wave errors per-file (don't fix in bulk; one concern
  per commit).
