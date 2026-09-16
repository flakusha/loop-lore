# giwt ↔ scripts keep-vs-wrap map

Pilot migration base (try 1). Source of truth for which `package.json` scripts stay in-repo vs delegate to `giwt` git dependency.

## Install

- Dependency: `"giwt": "github:flakusha/giwt#c53ffb5c9e09a6242b4a0cc60e27c05155b9811f"` (commit-pinned to giwt master HEAD; bumps per try-4/6/7 as the owner merges upstream). Owner installs manually with SSH keys (agent shells have no ssh by design); requires keys in every install env incl. CI, else `bun install` exits 1.
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
| `plan:backlog:sync*` | `giwt plan backlog-sync [--fix]` | stays (try 1) | done (try-7: script deleted) |
| `plan:docs` | `giwt plan gen-docs [--check]` | stays (try 1) | done (try-7: script deleted) |
| `plan:map*`, `plan:find` | `giwt plan code-map [--check \| --find <path>]` | stays (try 1) | done (try-7: script deleted; `extractSrcRefs` + `stripMarkdownCode` + `SRC_REF_RE` dropped from `scripts/lib/src-refs.ts`) |
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
- `plan:backlog:sync*`, `plan:docs`, `plan:map*`, `plan:find`: NO UPSTREAM → done in try-7 (`giwt plan` added in upstream commit `c53ffb5`; subsumes backlog-sync, code-map, gen-docs + adds check-links, validate, status).
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


## Try-6 docs canonicalization (`giwt` is now the user-facing CLI)

**Goal:** user-facing documentation points at `giwt <command>`; the
in-repo `scripts/worktree/` CLI becomes a load-bearing internal
implementation detail that callers stop invoking directly.

- Repository documents updated to reference `giwt` instead of
  `bun run scripts/worktree/ <x>`:
  - `AGENTS.md` (Quick Start, Discovery Commands, Worktree Workflow,
    Mutating-ops policy, GPG signing, Issue Tracking, Finalize recovery).
  - `docs/meta/workflow.md` (Issues commands, Worktrees commands,
    GPG signing section, End-to-end example).
  - `docs/meta/release-process.md` (Signing → agent commit line).
  - `docs/meta/code-practices-improvements/feat-bug-triage-batch-2-handoff.md`
    (Process per bug).
  - `docs/meta/code-practices-improvements/feat-stop-and-respond-interrupt-handoff.md`
    (Constraints).
  - `docs/meta/code-practices-improvements/next-batch-2026-09-02-plan.md`
    (Tools / handoff).
  - `docs/meta/code-practices-improvements/tree-finalization-candidates.md`
    (Outstanding finalize step).
  - `CONTRIBUTING.md` (Ticket + worktree section).
- Command-name changes documented in AGENTS.md / workflow.md:
  - `commit-branch` → `commit-wt` (giwt command name).
  - `ticket -l / -p` flags → `--label / --priority` (giwt long-form).
  - `merge <base> <feature>` → `merge <target-branch> <source>` (giwt arg order).
- The legacy `scripts/worktree/` CLI remains in-tree for backwards
  compatibility (subshims and tests still reference it), but new work
  should call `giwt` directly.
- Open (next steps, post-try-6):
  - Decide whether to delete `scripts/worktree/commands/*.ts` outright
    (and let `giwt` be the only entry point), or keep as a thin wrapper
    layer (`scripts/worktree/index.mjs` → `giwt <subcommand>`). The
    `scripts/worktree/utils/*` helpers (credentials, GPG, git helpers)
    are still load-bearing for `check-parallel.mjs` and must survive
    either path.
  - `check:report-ls` → `giwt report` rewrite is still REJECTED on the
    schema-drift grounds from try-2; revisit if upstream `giwt report`
    gains the `gates` section.
  - `scripts/gpg-unlock.mjs` → `giwt gpg-unlock` rewrite is unblocked by
    try-5 (no worktree-shim dependency); lands when owner authorizes.

## Try-6 cosmetic (giwt ASCII output)

- Bumped giwt pin from `34c8f02` → `fe463f4` (intermediate commit on master). Purely cosmetic — replaces unicode glyphs (☦, box-drawing) with bare ASCII + level tag. Default is `simple` (env `GIWT_OUTPUT=simple`); `pretty` keeps the old glyphs; `json`/`jsonl`/`toml` available for tooling.
- No script deletions; no table rewires. Just a dep bump.

## Try-7 plan tooling (`giwt plan`)

- Bumped giwt pin from `fe463f4` → `c53ffb5` (master HEAD). Adds `giwt plan <subcommand>`:
  - `backlog-sync [--fix]` — replaces `scripts/sync-backlog-index.ts`
  - `code-map [--check | --find <path> | --stale]` — replaces `scripts/plan-code-map.ts`
  - `gen-docs [--check]` — replaces `scripts/gen-plan-docs.ts`
  - `check-links` — new (markdown link + TASK ref validator)
  - `validate [--gates …]` — orchestrator: format, linkage, backlog, tickets, code-map, links, spdx, naming, epics-doc
  - `status` — health summary
  - `finalize --plan-gates <csv>` — runs `plan validate` before merge; `--force` skips
- Rewired `package.json`:
  - `plan:docs` → `giwt plan gen-docs` (added `plan:docs:check` for `--check`)
  - `plan:backlog:sync`, `plan:backlog:sync:fix` → `giwt plan backlog-sync [--fix]`
  - `plan:map`, `plan:map:check`, `plan:find` → `giwt plan code-map [--check | --find …]`
  - `scripts/check-parallel.mjs` gates (`backlog - index`, `code-map - freshness`) now transitively invoke giwt via these scripts — no direct edit needed.
- Deleted:
  - `scripts/sync-backlog-index.ts`
  - `scripts/gen-plan-docs.ts`
  - `scripts/plan-code-map.ts`
  - `scripts/lib/src-refs.ts` — kept the file (still used by `scripts/check-md-links.ts`); dropped the unused `extractSrcRefs` + `stripMarkdownCode` + `SRC_REF_RE` + `SrcRef` interface (now only `extractComments` + `extractDocRefs` remain).
  - `scripts/lib/src-refs.test.ts` — kept the file; dropped the `describe("extractSrcRefs")` block.
- Knip verified clean (3 unused files → 0; remaining config hints are pre-existing).
- Unit tests still pass: `bun test scripts/lib/src-refs.test.ts` (4 pass), `bun test scripts/scripts.test.ts` (40 pass), `bun test scripts/check-md-links.test.ts scripts/lib/` (8 pass).
- Run-record parity: `giwt plan backlog-sync` matches the deleted script's report format; `giwt plan code-map` writes `.plan/code-map.json` in the same shape so existing tooling (knip, search) sees no change.
- Unblocks the try-2 BLOCKED item for `plan:backlog:sync*` + `plan:docs` + `plan:map*` + `plan:find`. The remaining `gpg-unlock` migration is unchanged.
