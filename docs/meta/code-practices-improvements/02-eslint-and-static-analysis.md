# 02 — ESLint & Static Analysis

## Current state

`eslint.config.mjs` (flat config) is above average:

- `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`
- `eslint-plugin-unicorn` (recommended, with sensible off-switches)
- `eslint-plugin-sonarjs` (recommended)
- `eslint-config-prettier` (no-format conflicts)
- `eslint-plugin-markdown` (lints fenced code in `docs/`)
- Per-env overrides: **server** (Bun/Node), **frontend** (browser globals),
  **e2e**, **tests**, **scripts**
- `unicorn/filename-case: warn` (kebab + pascal + snake)

`check` runs `eslint .` plus `lint:css` (stylelint) and `lint:html`
(markuplint) — good multi-layer coverage. `jscpd` checks duplication.

## Gaps

### 1. No complexity ceiling → functions run to ~96
`sonarjs/recommended` does **not** set a `cognitive-complexity` cap. The
result, confirmed by code-health scan:

- `generation/providers/openai-compatible.ts#stream` — cognitive complexity 96
- `generation/generate-route.ts#handleGenerate` — 66
- `generation/image-gen-route.ts#handleImageGeneration` — 64
- `generation/auto-gen.ts#triggerAutoGeneration` — 58
- `plugins/loader.ts#loadAllPlugins` — 48

These are the exact functions that resist testing and extension. Add an explicit
cap (start at 20, tighten to 15) as an error, with targeted `// eslint-disable`
+ a refactor ticket only where genuinely warranted.

### 2. No `eslint-plugin-import`
There is no `import/no-cycle`, `import/order`, or `import/no-unused-modules`.
Given `src/db/schema.ts` is imported by ~96 files and `src/utils.ts` by ~52,
**circular-dependency risk is real and currently invisible**. `import/no-cycle`
would catch it at PR time. `import/order` enforces a consistent header layout
(cheap, high readability ROI).

### 3. No `no-misused-promises`
`@typescript-eslint/no-misused-promises` is **not** explicitly set to error.
This is the rule that catches passing a promise where a boolean/value is
expected (e.g. `if (someAsyncFn())`, event-handler returns). With many
`async` middleware/derive callbacks (`elysia-app.ts` `.derive`), this is a
latent class of bugs.

### 4. No `consistent-type-definitions`
AGENTS.md states **"Interfaces > types"** but nothing enforces it. Mixed
`interface`/`type` usage drifts. Add
`@typescript-eslint/consistent-type-definitions: ["error", "interface"]`.

### 5. Dead code slips through
LSP reports unused `Def` consts in `src/db/enums-core.ts`
(`messageStatusDef`, `actorVisibilityDef`, …). That means either
`noUnusedLocals` isn't catching them (they may be exported via a barrel) or
they're genuinely dead. Add `import/no-unused-modules` + a periodic dead-code
audit; delete the dead `Def`s if unused.

### 6. Frontend gets a softer ruleset
`eslint.config.mjs` frontend block turns several rules `off`
(`no-unused-vars: off`, `prefer-node-protocol: off`) and relies on browser
globals. Combined with the weaker frontend `tsconfig` (see `01`), frontend
logic is the least-guarded code in the repo.

### 7. No sorting/consistency linter
`eslint-plugin-perfectionist` (sort imports, exports, object keys) would
stabilize diffs and pair well with `import/order`. Optional but recommended
for a project that values "lightweight, maintainable".

## Recommendations

1. **Add `sonarjs/cognitive-complexity: ["error", 20]`** (backend) and
   immediately split the 5 functions above (see `04`). Start at 20 to avoid a
   flag-day; tighten to 15 next cycle.
2. **Add `eslint-plugin-import`**: `import/no-cycle: error`
   (maxDepth 1, warn above), `import/order` (builtin → external → internal →
   `@/` → type), `import/no-unused-modules` (per-file, opt-in).
3. **Add `@typescript-eslint/no-misused-promises: error`** backend + frontend.
4. **Add `@typescript-eslint/consistent-type-definitions: ["error",
   "interface"]`** to enforce the AGENTS.md convention automatically.
5. **Tighten frontend ESLint** toward parity with backend; keep only the
   genuinely browser-specific off-switches (`prefer-node-protocol`,
   `no-process-exit` stays error).
6. **Optional**: `eslint-plugin-perfectionist` for import/export sorting.
7. **Audit + delete dead `Def` consts** in `enums-core.ts`; add
   `import/no-unused-modules` to prevent recurrence.

## Suggested steps

- `bun add -d eslint-plugin-import eslint-plugin-perfectionist`
- Edit `eslint.config.mjs`:
  - add `import` to `plugins` + shared `rules`
  - add `sonarjs/cognitive-complexity: ["error", 20]`
  - add `@typescript-eslint/no-misused-promises: "error"`
  - add `@typescript-eslint/consistent-type-definitions: ["error", "interface"]`
  - add `import/order` + `import/no-cycle: ["error", { maxDepth: 1 }]`
- Run `bun run lint` → expect the 5 complexity errors + any cycles →
  refactor those files (see `04`) before flipping to error, or land the rule
  as `warn` for one cycle then `error`.
- Delete unused `Def` consts in `src/db/enums-core.ts`; verify `bun run typecheck`.
