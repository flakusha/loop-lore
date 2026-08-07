# Route-Module Split — Shared Contract (worktree file-split-routes)

Worktree path: `tree/file-split-routes` (IMPORTANT: work WITHOUT the `tree/...` prefix
resolves to the main repo on `dev` — ALWAYS prefix every path, or `cd` into the worktree
in the same bash command).

Reference implementations already committed (same pattern):

- Flat-bank barrel: `tree/file-split-routes/src/generation/auto-gen/` (from auto-gen.ts)
- Flat-bank barrel: `tree/file-split-routes/src/chat/service/` (from service.ts)
- Route barrel: `tree/file-split-routes/src/routes/messages/` (from messages.ts)

## Golden rules

1. **Pure refactor, zero behavior change.** Do not alter DB queries, error messages,
   HTTP status codes, route paths/methods, or exported signatures. Do not rename public symbols.
2. **Preserve the external import surface.** Move to a subdirectory + `index.ts` barrel
   re-exporting the SAME public names. Existing `import { xRoutes } from "./routes/views"` sites
   must keep working unchanged. `dead:code` must exit 0 (knip) — that is the proof the surface
   is preserved.
3. **Small files.** Each split file < 200 lines where feasible (250L hard ceiling).
4. **Run checks in the worktree** (`cd tree/file-split-routes && bun run typecheck`, then
   `bun test <affected file>`, then `bunx eslint <files touched>`). Target module tests must pass.
5. **Do NOT modify tests** to force green. Do NOT run `lint:fix` globally.
6. Do NOT touch `node_modules`, `bun.lock`, `package.json`, `bunfig.toml`.

## Pattern — route module → barrel + domain subdir

`routes/views.ts` is a single `export function viewsRoutes({ database })` Elysia plugin builder
(one `.get()/.post()/...` chain) plus internal helper functions. The split:

- Create `routes/views/` directory; move the original file's contents in.
- `routes/views/index.ts`:
  - Re-export the plugin builder `viewRoutes` (SAME name — callers do `import { viewRoutes } from
    "../routes/views"`; the directory resolves identically to the old file) plus any OTHER public
    exports (e.g. `applyI18n`, `serveView`). Keep every public export name identical.
  - Compose the plugin: import the sub-domain handler functions and build the same `.get()/.post()`
    chain, OR import sub-route modules that each return an Elysia instance and `.use()` them.
    The external behavior (URLs, methods, responses) MUST be identical.
- Group the internal helpers by domain into sibling files (e.g. `layout.ts`, `partials.ts`,
  `characters.ts`, `worlds.ts`, `nsfw-audit.ts`, `search.ts`, `chats.ts`). Helpers are module-local
  (not exported) unless another file needs them — then export them from a shared internal module
  and import, but do NOT re-export them from the public barrel unless they were public before.
- Keep shared constants (dirs, regexes, caches) in a `constants.ts` / `shared.ts` internal module.
- The route builder file(s) must not exceed 250L each.

## ESLint guidance

- `consistent-type-imports` is active: use `import type` for type-only imports.
- Comment-section headers (`// ── Domain ────────`) are the natural domain boundaries — follow them.
- Lint ONLY the files you touch.

## Verification (must pass before done)

- `cd tree/file-split-routes && bun run typecheck` → exit 0
- `cd tree/file-split-routes && bun test <the module's test files>` → all pass
- `bunx eslint <only the files you touched>` → 0 errors
- `cd tree/file-split-routes && bun run dead:code` → exit 0
- Re-run the size check: `bun scripts/check-file-size.ts --strict 2>&1 | grep <your module>` →
  no longer lists it as an offender.
