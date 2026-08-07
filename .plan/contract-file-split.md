# File-Split Refactor — Shared Contract

Worktree path: `tree/file-split-refactor` (IMPORTANT: work WITHOUT the `tree/...` prefix
resolves to the main repo on `dev` — ALWAYS prefix every path, or `cd` into the worktree
in the same bash command).

Reference implementation (already committed, equivalent pattern):
`tree/file-split-refactor/src/characters/services/mood-service/`

## Golden rules

1. **Pure refactor, zero behavior change.** Do not alter DB queries, error messages,
   HTTP status codes, or exported signatures that callers rely on. Do not rename public symbols.
2. **Preserve the external import surface.** Stateful class modules: keep the SAME exported
   name for the factory (declaration-merged interface + value) so existing `import { X }` and
   call sites work — only the CALL SHAPE changes (`new X(db)` → `X(db)`).
   Flat function banks: move to a subdirectory + `index.ts` barrel re-exporting the same names.
3. **Small files.** Each split file < 200 lines where feasible.
4. **Run the checks in the worktree** (`cd tree/file-split-refactor && bun run typecheck`
   then `bun test <affected file>`). Every target module's existing tests must pass.
5. **Do NOT modify tests** to force green. Do NOT run `lint:fix` globally (it reformats
   unrelated files). Lint only the files you touch.
6. Do NOT touch `node_modules`, `bun.lock`, `package.json`, `bunfig.toml`.

## Pattern A — class/stateful module → interface-merged factory + thisL dispatchers

For classes like `AvatarService`, `TraitsService`, `RelationshipsService`, `EmotionAvatarService`,
`PromptAssembler`:

- Create a directory `X/` (same name as the file) replacing `X.ts`.
- `X/index.ts`:
  - `export interface X extends XIface {}` (empty interface merges the factory value with a
    same-name type; add `// eslint-disable-next-line @typescript-eslint/no-empty-object-type`).
  - `export function X(db: Kysely<DB>): X { const self = {...}; return self; }` — each method
    delegates to a dispatcher: `getFoo: (args) => getFoo({ thisL: self, ...args })`.
  - Re-export type-only helpers from `./types`.
- `X/types.ts`: option types, return types, the `XService`/`XContext` interface = `X & { db }`,
  DERIVED row types via `Selectable<DB["table"]>` (single source of truth — don't hand-roll).
- `X/<method>.ts`: one dispatcher file per method, signature `({ thisL, ...args }) => ...`.
- Update callers: `new X(db)` → `X(db)`. If a caller typed `let x: X`, that still works (type).
- Delete the old `X.ts`.

## Pattern B — flat function bank / route module → barrel + domain subdir

For `chat/service.ts` (1830L), `routes/*.ts`, `generation/auto-gen.ts`, etc.:

- Move to `subdir/` with `index.ts` barrel re-exporting the same public names.
- Group functions by domain into sibling files.
- The barrel's re-export list must match the PREVIOUS exports exactly (knip `dead:code` exits 0).

## ESLint guidance

- Empty merge interface: `// eslint-disable-next-line @typescript-eslint/no-empty-object-type`.
- `consistent-type-imports` is active: use `import type` for type-only imports.
- `no-redeclare` does NOT fire on interface+value same-name in this repo (verified).

## Verification (must pass before considering done)

- `cd tree/file-split-refactor && bun run typecheck` → exit 0
- `cd tree/file-split-refactor && bun test <the module's test files>` → all pass
- `bunx eslint <only the files you touched>` → 0 errors
- `cd tree/file-split-refactor && bun run dead:code` → exit 0
