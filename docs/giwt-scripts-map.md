# giwt ↔ scripts keep-vs-wrap map

Pilot migration base (try 1). Source of truth for which `package.json` scripts stay in-repo vs delegate to `giwt` git dependency.

## Install

- Dependency: `"giwt": "git+ssh://git@github.com/flakusha/giwt.git#master"` in `package.json` (bun git dep; needs GitHub SSH key for `bun install`).
- Binary link (user-owned, outside repo — not committed): `ln -s /home/flak/git-ai/giwt/bin/giwt ~/.local/bin/giwt`.
- Wrapped scripts call `giwt <cmd>` (resolved via `node_modules/.bin` after `bun install`); source-checkout fallback: `bun /home/flak/git-ai/giwt/src/cli.ts <cmd>`. Parity proven try 1: `giwt sync` ≡ `scripts/sync-ticket-index.ts` (both green on this tree).

## KEEP in `scripts/` (real code maintenance)

Build/type/lint/test/format + code-generated artifacts + correctness gates:

- `build-frontend.mjs`, `build-native.ts` (`build:*`, `dev`, `start`, `tui`)
- `generate-db-types.ts`, `generate-schema-manifest.ts`, `generate-openapi.ts`, `check-schemas.ts`, `fix-schemas.ts` (`db:*`, `schemas:*`, `openapi`)
- `check-scenario-catalog.ts`, `gen-scenario-catalog.ts` (`sc:*`)
- `check-parallel.mjs`, `check/*` (`check:*`, `ci`)
- `check-file-size.ts`, `check-wiring.ts`, `check-context-weight.ts`, `check-md-links.ts`, `check-spdx.ts`, `check-licenses.ts`, `check-changelog.ts` (`size`, `wiring`, `context:weight`, `md:links`, `spdx`, `license`)
- `i18n-reconcile.ts` (`i18n:*`); `gen-deno-config.ts`, `gen-pkg-from-deno.ts`, `audit-runtime-compat.ts` (`deno:*`)
- `run-benchmarks.ts` (`bench:*` — code perf, stays until `giwt runs`/`report` covers it)
- `src/scripts/version-bump.ts`, `src/scripts/commit-check.ts`, `src/scripts/smoke-app.ts` (`version:*`, `commit:*` — stay until giwt gains version/commit parity)
- `scripts/lib/*` shared helpers; `*.test.ts` beside scripts

## WRAP via `giwt` (dev workflow — pilot first, rest phase 2)

| `package.json` script | today | pilot (try 1) | phase 2 |
|---|---|---|---|
| `plan:sync` / `plan:sync:fix` | `scripts/sync-ticket-index.ts [--fix]` | `giwt sync [--fix]` | delete `scripts/sync-ticket-index.ts` after parity proven |
| `plan:backlog:sync*` | `scripts/sync-backlog-index.ts` | stays (try 1) | `giwt sync --backlog` or `giwt ticket sync` extension |
| `plan:docs`, `plan:map*`, `plan:find` | `gen-plan-docs.ts`, `plan-code-map.ts` | stays | `giwt report` / `giwt search` extension |
| worktree ops (`scripts/worktree/`) | local CLI | stays (try 1) | thin shim to `giwt` (already feature-complete upstream) |
| `gpg-unlock` | `scripts/gpg-unlock.mjs` | stays | `giwt gpg-unlock` (exists upstream) |

## Try-1 scope (this branch)

- Add `giwt` git dependency to `package.json`.
- Rewire `plan:sync`, `plan:sync:fix` to `giwt sync [--fix]`.
- Keep `scripts/sync-ticket-index.ts` in tree (no deletion) until parity proven.
- Validate: `bun install`, `bun run plan:sync`, `.githooks/pre-commit` on staged files.
