# giwt ↔ scripts keep-vs-wrap map

Pilot migration base (try 1). Source of truth for which `package.json` scripts stay in-repo vs delegate to `giwt` git dependency.

## Install

- Wiring: REVERTED try 3 (was: `"giwt": "git+ssh://git@github.com/flakusha/giwt.git#master"` + `plan:sync*` → `giwt sync`). Reason: `bun install` exits 1 without a GitHub SSH key, `.github/` has no SSH setup (CI would break), and HTTPS also needs auth (private repo). Re-land when one holds: repo public, CI SSH keys/token, or giwt published to a registry.
- Binary link (user-owned, outside repo — not committed): `ln -s /home/flak/git-ai/giwt/bin/giwt ~/.local/bin/giwt`.
- Pilot proof (try 1, from source): `bun /home/flak/git-ai/giwt/src/cli.ts sync` ≡ `scripts/sync-ticket-index.ts` (both green on this tree). Re-apply `plan:sync*` → `giwt sync [--fix]` on re-land.

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

## Try-2 audit (no further rewires — evidence)

- `check:report-ls` → `giwt report`: REJECTED. Different worktree roots and `giwt report` flags loop-lore's valid reports malformed (missing `gates` section — schema drift). Stays in-repo.
- `scripts/sync-ticket-index.ts` deletion: BLOCKED. `scripts/worktree/commands/sync.ts` shells out to it; removal waits for the worktree-shim phase.
- `scripts/gpg-unlock.mjs`: STAYS. Load-bearing for worktree commit paths and `check-parallel`; design doc pins it as the human-facing unlock command.
- `plan:backlog:sync*`, `plan:docs`, `plan:map*`, `plan:find`: NO UPSTREAM. `giwt sync` covers tickets only; `giwt report`/`search` don't cover plan-docs/code-map. Needs giwt extensions (phase 3).
- `version:*`, `commit:*` (`src/scripts/`): OUT OF SCOPE (denylist: `src/`).
- `bun install` of the git dep needs a GitHub SSH key in every install env (harness shell has none; CI has no SSH setup) — see Try-3.

## Try-3 reversal (final try — no rewiring lands)

- Measured: `bun install` with the SSH git dep exits 1 keyless; `git ls-remote` over HTTPS also needs auth. Landing the dep would break fresh installs and CI. So `package.json` is restored to dev state (verified: `bun install` exits 0, `--stat` shows only the revert).
- What lands: this mapping doc only — keep-vs-wrap table, pilot parity proof, rejected/blocked wraps with evidence, and re-land conditions (public repo, CI keys/token, or registry publish; then re-apply `plan:sync*` → `giwt sync` and pursue the worktree shim + upstream extensions).
- Cap reached (3/3 tries). No push; further migration needs owner decisions above.
