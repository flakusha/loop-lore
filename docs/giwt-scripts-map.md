# giwt ↔ scripts keep-vs-wrap map

Pilot migration base (try 1). Source of truth for which `package.json` scripts stay in-repo vs delegate to `giwt` git dependency.

## Install

- Dependency: `"giwt": "git+ssh://git@github.com/flakusha/giwt.git#master"` (bun git dep, unversioned `master` while giwt is in cleanup/dev). Owner installs manually with SSH keys (agent shells have no ssh by design); requires keys in every install env incl. CI, else `bun install` exits 1.
- `plan:sync` / `plan:sync:fix` → `giwt sync [--fix]` (parity proven try 1 from source: both green).
- Binary link (user-owned, outside repo — not committed): `ln -s /home/flak/git-ai/giwt/bin/giwt ~/.local/bin/giwt`.

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
| `plan:sync` / `plan:sync:fix` | `giwt sync [--fix]` | `giwt sync [--fix]` | done (try-5: script + test + lib deleted, worktree `sync` shims to giwt) |
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

## Try-4 re-land (owner-authorized, manual install)

- Owner confirmed manual `bun install` of the giwt git dep works with their SSH keys (agent-shell ssh lock is expected). Re-applied try-1 wiring: git dep + `plan:sync*` → `giwt sync [--fix]`.
- In-harness install verification still impossible (no ssh); owner smoke-tests with `bun run plan:sync` post-merge. CI caveat stands: needs keys/token or the dep breaks keyless installs.
- Remaining: worktree shim + deletions + upstream extensions (backlog/docs/map/report parity) — needs giwt-side work first.

## Try-5 cleanup (worktree shim + deletion)

- `scripts/worktree/commands/sync.ts` is now a thin shim over `giwt sync` (flags pass through verbatim; runs in the caller's checkout so giwt resolves worktree-aware paths instead of the old forced main-root cwd).
- Deleted `scripts/sync-ticket-index.ts`, `scripts/sync-ticket-index.test.ts`, `scripts/lib/sync-ticket.ts` (lib had no other consumers) and dropped the knip exemption.
- Unblocks the try-2 BLOCKED item above; remaining phase-2 work (backlog/docs/map/report parity, `gpg-unlock`) is unchanged.
