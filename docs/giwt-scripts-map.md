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
- `run-browser-tests.ts` (`test:e2e:browser`)
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
| `plan:backlog:sync*` | `giwt backlog sync [--fix]` | stays (try 1) | done (try-7: script deleted; re-pointed in try-9 — the `giwt plan backlog-sync` subcommand named here never existed) |
| `plan:docs` | `giwt plan gen-docs [--check]` | stays (try 1) | done (try-7: script deleted) |
| `plan:map*`, `plan:find` | `giwt plan code-map [--check \| --find <path>]` | stays (try 1) | done (try-7: script deleted; `extractSrcRefs` + `stripMarkdownCode` + `SRC_REF_RE` dropped from `scripts/lib/src-refs.ts`) |
| worktree ops (`scripts/worktree/`) | local CLI | stays (try 1) | **not a shim** — a full duplicate implementation; retirement is a migration, tracked by the fork-retirement ticket (see try-8) |
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
- The legacy `scripts/worktree/` CLI remains in-tree only until its deletion
  lands. All worktree work goes through `giwt`.
- Open (next steps, post-try-6) — **delete-vs-shim is settled: delete**
  (2026-10-02):
  - Delete `scripts/worktree/` so `giwt` is the only entry point. No thin
    wrapper layer. **Blocked on re-pointing the live imports first:**
    `scripts/lib/colors.ts`, `scripts/lib/assertions.ts`, and
    `scripts/gpg-unlock.mjs` (via `worktree/utils/credentials.mjs`) import
    from `scripts/worktree/utils/`, and the `giwt` equivalents are not
    drop-in (`colors` 93 vs 49 lines, `credentials` 90 vs 134, `gpg` 172 vs
    165). Either preserve the needed helpers under `scripts/lib/` or import
    from the pinned `node_modules/giwt`. Same change must remove or repoint
    `tests/worktree-flow.test.ts`.
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
  - `backlog-sync [--fix]` — replaces `scripts/sync-backlog-index.ts`.
    **Correction (try-9):** `giwt plan backlog-sync` does not exist at the
    current pin (`unknown plan subcommand 'backlog-sync'`); backlog
    reconciliation lives under the top-level `giwt backlog sync`. The lines
    below record what try-7 wired, not what resolves today.
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


## Try-8 fork backport (three upstream fixes, applied in-repo)

The in-repo CLI at `scripts/worktree/` is a **duplicate implementation**, not a
shim try-6 described — `rebase.ts`, `finalize.ts`, `abort.ts` and friends each
carry their own git logic. It had fallen three fixes behind upstream `giwt`.
Backported rather than deleted, because the delete-vs-shim call above was still
open and owner-gated.

**Superseded (2026-10-02).** The delete-vs-shim question is settled: delete.
All three backports above have since landed upstream in `giwt`, so the fork is
no longer ahead — upstream re-verified: detached-root finalize guard at
`finalize.ts:1215-1234`, git env isolation 50/50 spawns isolated (fork 39/39),
rebase default target at `rebase.ts:25`, and `commit`/`commit-wt` spread the
filtered env with only `GIT_COMMITTER_*` re-set (`commit.ts:99`,
`commit-wt.ts:118`). Deletion is **blocked**, not by the parity question but by
live imports: `scripts/lib/colors.ts`, `scripts/lib/assertions.ts`, and
`scripts/gpg-unlock.mjs` (the last via `worktree/utils/credentials.mjs`) still
import from the fork, and their `giwt` counterparts are not drop-in
(`colors` 93 vs 49 lines, `credentials` 90 vs 134, `gpg` 172 vs 165 — all
diverged). `tests/worktree-flow.test.ts` also drives the fork directly. The
"Upstream divergence, deliberately not mirrored" note below is likewise stale:
upstream now refuses protected rebase targets, and the fork's copy of that
refusal is what upstream adopted.

- `utils/git.ts`: added `isolatedGitEnv()` and wired it into `gitSync` /
  `gitSyncQuiet`, plus the git-child spawns in `finalize.ts` and `rebase.ts`.
  Without it a harness-set `GIT_INDEX_FILE` flips the
  `git diff --cached --quiet` precheck verdict, so finalize/rebase gate on a
  lie. `OMP_`/`PI_`/`ENGRAM_`/`MNEMO_` session vars leak the same way.
- `commands/finalize.ts`: fixed 20ms lock retry replaced with full jitter
  (`lockRetryDelayMs()` over `[0, 20ms]`, 50 attempts, ceiling unchanged).
- `commands/rebase.ts`: the default target no longer falls back to the literal
  `master` on a detached HEAD (it refuses instead), and a self-rebase is now
  refused up front rather than by git after the full find-worktree walk.
- Deleted the two duplicate `PROTECTED_BRANCHES` / `isProtected` copies
  (`rebase.ts`, `finalize.ts`) in favour of the `utils/git.ts` export.
- `AGENTS.md` corrected: the legacy CLI is not a shim.

**Upstream divergence, deliberately not mirrored:** upstream refuses a
*protected target* in `rebase` (`cannot rebase onto protected branch 'dev'`).
With `DEFAULT_SETTINGS.branches.protected = [master, main, stg, dev]` and
`root = dev`, that makes the documented `giwt rebase <branch>` (no `onto`)
fail on a default config. The fork keeps protected *sources* refused and allows
protected targets.

## Try-9 orchestration sync (pin enforcement + unwired surface)

No dependency bump: the pin already tracked giwt master. This closes three
gaps between the repo's wiring and what the pinned giwt actually provides.

### Pin enforcement

`~/.local/bin/giwt` is a symlink to a *mutable local checkout*, so a bare
`giwt` can run a different commit than `bun.lock` pins — today they happen to
agree (`51fddd5`), which is coincidence, not enforcement.

- **`package.json` scripts need no change.** `bun run <script>` prepends
  `node_modules/.bin` ahead of `~/.local/bin`, verified by probe: every
  `giwt …` script resolves `node_modules/.bin/giwt` → the pinned
  `node_modules/giwt/src/cli.ts`.
- **`scripts/worktree/commands/sync.ts` DID.** It was the only bare-`giwt`
  spawn in `scripts/`, `src/`, tests and `.githooks`, relying on ambient PATH.
  It now resolves through an exported pure helper `giwtArgv(repoRoot)`, which
  spawns `node_modules/giwt/src/cli.ts` under the current interpreter and
  falls back to the bare name only when the pin is absent. Covered by
  `scripts/worktree/commands/sync.test.ts` (pinned / PATH-shadow / no-pin).

### Unwired giwt surface

- `plan:backlog:sync{,fix}` routed through `giwt plan validate --gates
  backlog`, a heavyweight indirection left over from when no dedicated
  command existed. Now calls `giwt backlog sync [--fix]` directly.
  **Behavioural difference**: the gate treats `outside` rows as warn-only,
  while `backlog sync` counts them in `issueCount` and exits 1. The check
  gate is therefore *stricter* for `outside` rows — acceptable (it is a
  genuine index defect), and `plan:validate` still reports them as advisory.
- `giwt plan matrix` (generates `.plan/feature-matrix.md`) had no script at
  all, despite the `matrix` validate gate telling you to run it. Added
  `plan:matrix` / `plan:matrix:check`; registered `plan - matrix` in
  `check-parallel.mjs` as a freshness gate.
- `plan validate` runs 11 gates, not the 10 AGENTS.md claimed — `status-vocab`
  and `matrix` are new. AGENTS.md now lists them and documents the canonical
  `**Status:**` vocabulary.

### Still open (unchanged, owner-gated)

**Corrected (2026-10-02).** This section previously claimed the fork still
carried commands upstream lacked, citing a missing `doctor` and a more capable
in-repo `report`. That is backwards: `doctor` is a giwt command with no
in-repo counterpart, and giwt's `report` is the one with the multi-container
scan (`giwt report`, added upstream). The fork has not been ahead since the
try-8 backports landed upstream. Retire-vs-shim is no longer an owner
decision — it is settled as delete, blocked only on the import re-pointing
described in the try-6 open-items list.
