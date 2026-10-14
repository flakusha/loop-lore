<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

<!-- SPDX-LicenseCopyrightText: 2026 Loop Lore Contributors -->

# Tooling Unification Audit

Which tooling improvements would make agent-driven development smoother and faster
across `loop-lore` (A), `giwt` (B), and `omp-plugins` (C) — and which can be made
universal (usable by any repo) instead of loop-lore-specific.

Everything below cites a file actually read. Where a claim rests on a subagent
transcript rather than a direct read, the path is still given so it can be checked.

**Revision scope.** Citations into A (this repo) are live. Citations into B
(`giwt/src/**`) were verified against the dependency resolved in `bun.lock`
(`flakusha-giwt-b4d1928`) and re-verified when this doc was rebased onto `dev`
at `bc2f3f405` — the pin was unchanged at that point. Note that `package.json`
specifies giwt as a floating `github:flakusha/giwt`, not a pinned commit, so the
next `bun install` can move the resolution and these line numbers with it; giwt's
`master` has moved since, and the lock has not followed yet. Re-check them
against whatever `bun.lock` resolves when you read this.
Citations into C (`omp-plugins`) could not be verified here at all — that
checkout is not available in this repo — and are carried as written from the
session that read them.

---

## 1. B (`giwt`) surface map

Entry points: `src/cli.ts` (Optique parser + dispatch, `ROOT_ONLY_COMMANDS` for
worktree-layout mutators), `src/cli-registry.ts` (one `CommandHandler` per
subcommand, keys aligned to `src/commands/<key>.ts`). `bin/` holds the built
`giwt` binary. There is no `.agents/skills/` in B — the usage skill lives in A at
`.agents/skills/giwt-usage/SKILL.md` (the file named in the task brief), and the
project config is A's `giwt.toml`.

### 1.1 Three layers

**Layer 1 — generic git/worktree ops.** `new`, `create`, `list`, `branches`,
`status`, `diff`, `remove`, `cleanup`, `rebase`, `merge`, `finalize` (alias
`agent-merge`), `abort`, `prs`, `commit`, `commit-wt`, `sign`, `gpg-unlock`,
`git`, `attach`, `attach-dir`. Configured by `[branches] root` and the `git`
section of `giwt.toml`. These work in any git repo.

**Layer 2 — loop-lore planning.** `plan`, `backlog`, `ticket`, `sync`. Each is
bound to `.plan/`:

| Command | Binding | Evidence |
| --- | --- | --- |
| `plan` | 8 subcommands over `settings.paths.planDir` (default `.plan`) | `src/commands/plan.ts:5` |
| `backlog` | `join(planDir, "backlog")` | `src/commands/backlog.ts:56` |
| `ticket` | ticket files + git issues under `settings.paths.tickets` | `src/commands/ticket.ts:4` |
| `sync` | ticket-index sync; regenerates feature matrix + code map on `--fix` | `src/commands/sync.ts:113-124` |
| `plan validate` | 11 gates, all `.plan/` management | `src/plan/validate/types.ts:25-37`; `src/plan/validate/run.ts:77` |

The `plan validate` gate names are the concrete loop-lore surface: `format`,
`linkage`, `backlog`, `tickets`, `code-map`, `links`, `spdx`, `naming`,
`epics-doc`, `status-vocab`, `matrix`. `spdx` and `status-vocab` are not
planning concerns — they are generic file checks wearing a `.plan/` gate name.

**Layer 3 — configurable-generic observability/hygiene.** Works in any repo;
every knob is a `giwt.toml` setting (`src/utils/settings.ts`,
`src/utils/settings-schema.ts`).

| Command | Config knobs |
| --- | --- |
| `clean` | `scratch.root`, `scratch.tmpMaxAgeDays`, `scratch.lcovKeepLatest`, `scratch.jscpdMaxAgeDays`, `scratch.checkReportKeep` (`src/commands/clean.ts:7`, `src/utils/scratch.ts:78-86`) |
| `tmp` | `tmp.root`, `tmp.prefixes[]`, `tmp.max_age_hours`, with root-allowlist + euid + age safety gates (`src/commands/tmp.ts:7-12`) |
| `runs` | `paths.runlog`, `max_runs` (`src/commands/runs.ts:42`) |
| `doctor check` / `doctor detect` | `doctor.jobs`, `doctor.timeout_ms`, `doctor.memory_budget_mb`, `doctor.scratchpad_*` (`src/utils/settings.ts:33-36`, `src/utils/settings-schema.ts:24-28`); `memory_budget_mb` is consumed by the finalize check-slot pool (§5.2) |
| `report` | `paths.checkReport`, worktree dir walk (`src/commands/report.ts:91-114`) |

### 1.2 Defects found in the generic layer

**`giwt report` could not read loop-lore's report — FIXED upstream, shipped in
ec7425ee.** *(Was: `src/commands/report.ts:47-53` threw unless the payload had a
`gates` map, and the renderer read `reportData.timestamp`; loop-lore's runner
emits `schemaVersion: 2` with `checks[]` / `generatedAt` and no `gates` map, no
`timestamp` (`scripts/check/parallel/report.mjs:164-206`), so every row printed
"malformed report".)*

The parse now lives in `src/commands/report-parse.ts` and accepts both shapes:
v2 `checks[]` first, legacy `gates` map as fallback, with v2 `generatedAt`
standing in for the legacy `timestamp`. Non-pass states are distinguished
rather than collapsed — `checkStatus()` maps `skipped` > `timedOut` > `passed` >
`advisory` > `failed`, in that precedence, so a skipped gate is not rendered as
a pass and an advisory failure is not rendered as a red gate. Verified against
the pinned build: every worktree row renders with `advisory` and `skipped` shown
distinctly.

Two edge cases the fix does NOT cover, both benign: a v2 report whose `checks`
is `[]` parses but reports `passed=false` with zero gate rows, and a payload
carrying an EMPTY `gates` map alongside a populated `checks[]` takes the legacy
branch (the `gates` check runs first) and shows no gate rows. Neither throws;
none is reachable from loop-lore's runner.

**`giwt clean` prunes four fixed classes and nothing else.**
`src/utils/scratch.ts:53` types `ScratchClass.name` as
`"tmp" | "lcov" | "jscpd" | "check-report"`. It scans one root
(`scratch.root`, default `.tmp`). Two consequences follow, and they point in
opposite directions.

Anything else under that root is invisible to it: `.tmp/async-store/`,
`.tmp/run-<id>-<hash>/`. loop-lore compensates with its own retention pass
(`scripts/check/parallel/retention.mjs`, wired at `report.mjs:240-241`), so the
keep-count and the prune policy now live in two places.

Some exclusions are *deliberate durability*, not an oversight:
`src/history/skips.ts:8-12` states that the rebase skip ledger sits outside
`runs/` precisely so it survives `runlog.max_runs` pruning, `giwt clean`'s four
classes, and worktree teardown. `src/utils/runlog.ts:10-13` makes the same call
for run records (they live under `repoRoot`, not the worktree, because a
successful `finalize` deletes its own evidence otherwise). So the class list is
a floor, not a ceiling — and any generalization of it must be opt-in (§4.3).

**Ledger retention is count-only.** `LEDGER_MAX_RECORDS = 50` in
`src/utils/ledger-core.ts:25`, applied by `slice(-LEDGER_MAX_RECORDS)` on every
append (`src/utils/ledger.ts:169`). No time-based expiry exists. A quiet week
still leaves the same 50 records; a busy hour evicts a day of history.

### 1.3 Pre-commit hook (B's `.githooks/`)

Four steps in `.githooks/pre-commit`: identity gate (blocking), `bun run check`
(blocking), SPDX headers (warn), check-report freshness (warn, reads
`$REPO_TOP/.tmp/check-report.json`). `.githooks/identity-gate.sh` encodes a
loop-lore incident response; `.githooks/gate-env.sh` strips `GIT_*` plus
`OMP_`/`PI_`/`ENGRAM_`/`MNEMO_` prefixes. The *shape* (identity → gates →
artifact freshness, warn vs block) is universal; the *content* is not.

### 1.4 Generic git shapes absent from the registry

`stash`, `log`, `blame`, `bisect`, `reflog`, `cherry-pick`, `fetch`, `reset`,
`revert`. `diff` only handles worktree-branch diffs. Agents fall back to raw
`git` for these, which routes through the C plugin's reroute hook or the
passthrough — two hops instead of one.

---

## 2. C (`omp-plugins`) plugin map

One plugin: `plugins/oh-my-pi-integration`. Manifest is
`{"omp": {"extensions": ["./extensions/index.ts"]}}`. Four layers: the omp
extension, `hooks/pre/*` pre-tool hooks, `rules/*.md`, and a manifest-driven
installer in `scripts/`.

### 2.1 Interface shape

`extensions/index.ts` is a `pi.on(...)` EventEmitter registering
`before_agent_start`, `session_start`, `input`, plus `registerCommands(pi)` and
`pi.setLabel("engram")`. Pre-hooks under `hooks/pre/` are
`(cmd: string) => { blocked: boolean; message?: string }`. Rules are markdown with
YAML frontmatter (`name`, `description`, `condition`, `scope`). Every feature is
env-gated (`PI_INTEGRATION_DISABLE`, `PI_RECEIPT_DISABLE`) and fail-open.

This interface is the reusable part of C: a new capability is a hook file or a
rule file, not a fork.

### 2.2 The receipt ledger

`<project>/.omp/receipt.toml` is a `[[job]]` / `[[issue]]` TOML ledger the agent
maintains. Each turn `carryReceipt` bumps `[carriage] n`, stamps `done_at` on
finished jobs, prunes them after `RECEIPT_KEEP` carries, and injects a capped
footer message. Chores are line-oriented so human comments survive
(`extensions/receipt/receipt.ts:1-27`), guarded by a `mkdir`-atomic lock with a
bounded-wait stale-holder fallback (same shape as giwt's `withLedgerLock`).
`.tmp/` writes are tracked in-process and surfaced as `session_artifacts`
(`extensions/index.ts:61-68`).

Separately, `extensions/receipt/giwt-footer.ts` merges giwt's `.ledger.jsonl`
into the same footer via `giwt-bridge.ts` + `ledger-watch.ts`, with the watcher
snapshot preferred only when it watches this session's resolved path.

Retention: `RECEIPT_KEEP` (receipt chores) and `MAX_LEDGER_ENTRIES` (footer cap)
are both count-based, matching B's ledger.

### 2.3 Universal vs loop-lore-bound

| Item | Verdict | Binding |
| --- | --- | --- |
| `extensions/receipt/receipt*.ts` (parse, carry, join, doc) | universal | path derived from `ctx.cwd` |
| `util/tmp-write-tracker.ts`, `plugin/guards.ts`, `hooks/pre/harness-evasion-guard.ts`, `hooks/pre/lean-ctx-native-reroute.ts` | universal | no repo paths |
| `rules/*.md`, `agent/APPEND_SYSTEM.md`, `agent/config.yml`, `scripts/install*.ts`, `scripts/check-*.ts` | universal | `OMP_CHECKS_ROOT` / `OMP_COVERAGE_CHILD` env overrides |
| `extensions/receipt/giwt-{bridge,footer}.ts`, `extensions/receipt/ledger-watch*.ts` | giwt-bound | reads `.ledger.jsonl`, `giwt.toml` |
| `hooks/pre/git-giwt-reroute.ts` | giwt-bound | rewrites `git worktree/merge/commit` argv shapes to `giwt` |
| `commands/find-work.ts`, `commands/bookkeep.ts`, `util/plan-frontmatter.ts` | loop-lore-bound | scan `.plan/`, `.plan/tickets/` |
| `util/giwt-{config,resolve}.ts`, `commands/worktree.ts` | loop-lore-bound | `tree/` worktree layout |
| `.githooks/identity-gate.sh`, `.githooks/commit-msg` | repo-policy | loop-lore identity + trailer rules |

### 2.4 C's pre-commit

`.githooks/pre-commit` runs the identity gate always (commit-wide), then
`tsc --noEmit` / `bun run lint` / `bun test` when TS, config, md, or shell files
are staged. Staged detection decides *whether*, not *what* — a deliberate choice
the header states: the gates are fast enough that scoping them would cost more
than it saves. `gate-env.sh` is sourced, not executed, so the `GIT_*` half and
the `OMP_`/`PI_`/`ENGRAM_`/`MNEMO_` half cannot drift.

---

## 3. Scratch-script promotion table

`.tmp/` is the correct home for all of these (`AGENTS.md:111-143`). The question
is which are one-off probes, which are already duplicated by a committed script,
and which encode a reusable capability that currently has no home.

| Script | Verdict | Reason |
| --- | --- | --- |
| `mine-gates.ts` | **OBSOLETE — superseded by `giwt report --profile`** | Cross-run gate-failure-frequency mining over `.tmp/check-report-*.json` schema v2. It existed only because `giwt report` could not read that schema (§1.2); upstream `ec7425ee` shipped `--profile`, which profiles every per-run report in the worktree (not just the latest) with fail/timeout/advisory/skipped counts and median/p90/max duration. The reason this row existed is gone; the scratch script should not be promoted. |
| `verify.ts` | **PROMOTE-TO-GIWT** | Import-graph + non-test-importer census for a target dir; answers "what breaks if I delete this" with no dependency on loop-lore. |
| `fmt.mjs` | **DELETE** | A scratch copy of the committed `scripts/check/co-author-trailers.mjs`; the repo already owns it. |
| `fmt.test.mjs` | **DELETE** | Same, for the committed `scripts/check/co-author-trailers.test.mjs`. |
| `fix.ts` | **DELETE** | One-off codemod of a specific commit's findings; superseded by the edit it produced. |
| `advr-count.ts` | **DELETE** | Counts JSDoc blocks over 3 lines in five named giwt scripts; a `plan validate` gate concern (`naming`), not a script. |
| `allowlist-check.ts` | **KEEP-AS-IS** | Proves which of two exact browser error wordings the allowlist regexes match; genuinely repo-specific and short-lived by nature. |
| `chk.ts` | **DELETE** | Superseded by `mal.ts` (same check, relative path instead of an absolute worktree path). |
| `mal.ts` | **KEEP-AS-IS** | One-shot `.plan/tickets` status-vocabulary probe; `giwt plan validate`'s `status-vocab` gate owns this permanently. |
| `verify-fixes.ts` | **DELETE** | Asserts specific string edits in `src/views/admin.html` and a committed check script; a test, and the test it wanted already landed. |
| `verify-rpg-findings.mjs` | **KEEP-AS-IS** | Re-derives level/XP arithmetic to confirm a review finding; domain math, not tooling. |
| `zzz-doc-leak-probe.test.ts` | **KEEP-AS-IS** | Order-dependent probe (`zzz-` sorts last) proving a mock-DOM leak; correct as a scratch probe, wrong as a committed test. |
| `repro-404.browser.ts` | **KEEP-AS-IS** | Captures Chromium's raw wording for an allowlist decision; needs the loop-lore browser helpers and seed. |
| `debug-spdx.ts` | **DELETE** | Repro harness for a fixed `src/utils/spdx-fix` bug; `bun run spdx:fix` plus its unit test covers the path. |
| `eslint-check.py` | **DELETE** | Re-runs eslint with a JSON formatter against a stale worktree path; `bun run lint:eslint` and the check report already carry the signal. |
| `find-errors.mjs` | **DELETE** | Filters a stale multi-megabyte `lint-errors.json` from a worktree that no longer exists; `mine-gates.ts` supersedes offline log triage. |
| `fix-imports.py` | **DELETE** | Hardcoded string replacements against giwt's `src/utils/` files; a one-time edit, and the fix already landed. |
| `lines.ts` | **DELETE** | Two-file size probe against `scripts/check-file-size.ts`; `bun run size` is the command. |
| `.tmp/jscpd-triage/{analyze,delta,outline}.py` | **KEEP-AS-IS** | Report-slicing helpers for one duplication-reduction change: group jscpd duplicate pairs, diff two reports, sketch split points. Tied to a jscpd report's JSON shape, not to a repo. |
| `.tmp/jscpd-triage/dupfiles.py` | **PROMOTE-TO-OMP-PLUGINS** | Distinct signal: tracked files whose *entire content* is identical — a botched-rebase signature. Not covered by `scripts/check/weave-damage.mjs`, which counts consecutive duplicate *lines* against a base ref (`weave-damage.mjs:6-27,39-43`). Needs its hardcoded repo root parameterized out. |
| `.tmp/cm-recover/count-keys.mjs` | **DELETE** | One-shot key census over a damaged-mapfile recovery; the recovery is done. |
| `.tmp/branch-gm-notes-test.ts` | **DELETE** | Scratch assertion file for a specific commit-message change. |

`mine-gates.ts` and `verify.ts` are the two that earn promotion. Everything else is
either already owned by a committed gate or was a probe for a decision already
taken.

### 3.1 The adoption problem, not the tooling

`.tmp/` sprawl in this repo is not a missing-command problem. `giwt clean`
already prunes four classes (`src/utils/scratch.ts:53`), the runner already GCs
per-run dirs (`scripts/check/parallel/retention.mjs`), and `AGENTS.md:122`
already says "delete before finalize". The scripts above are the residue of agents
not running the commands that exist. The fix that pays is a **finalize-time
prune step**, not a new pruner — see §4.1.

---

## 4. Universalization proposals

Each proposal generalizes an existing command. None adds a new top-level verb.

### 4.1 `giwt finalize` runs the prune it already documents — SHIPPED (ec7425ee)

**Status: delivered upstream and installed here.** Implemented as Step 6a in
`src/commands/finalize/scratch-prune.ts`, called from
`src/commands/finalize/teardown.ts` immediately before the worktree is removed.
It reuses the same `scanScratch` (`giwt/src/utils/scratch.ts`) that `giwt clean`
and `doctor scratchpad` use — no second pruner, no new scratch class, no new
config key — and records bytes freed in the run record. `giwt finalize
--dry-run` reports the plan and deletes nothing.

Safety properties, all verified against the pinned build: the prune runs AFTER
Step 2 gates (so it cannot destroy the report a gate just wrote) and before
worktree removal; a missing scratch root is a no-op, not an error; the walker skips
symlinks inside the root and `pruneWorktreeScratch` refuses outright when the
scratch ROOT itself is a symlink; deletion failures are collected and never fail
the finalize; and bytes outside the four scratch classes are reported as
unclassified rather than silently widened.

**Why universal:** every repo that uses `giwt clean` wants the scratchpad gone
when its worktree disappears, and every repo that does not have the command does
not get it invoked. This is the difference between a documented rule and an
enforced one.

**Rejected variant:** a new `giwt scratch prune` command. `giwt clean` already
owns this (`src/cli-registry.ts:84-87`); a second verb would split the surface.

### 4.2 `giwt report` learns the schema, gains `--profile` — SHIPPED (ec7425ee)

**Status: delivered upstream and installed here.** This section was a proposal;
it is now the implemented behaviour, recorded here as the reference. Do not
re-derive it. What shipped:

```
giwt report                    # per-worktree status, schema-adapted (unchanged shape)
giwt report --profile          # cross-worktree gate failure + duration table
giwt report --profile --since <iso> [--json|--toml|--emoji]
```

Parsing moved out of `report.ts` into `src/commands/report-parse.ts` (rendering
stayed in `report.ts`). v2 `checks[]` is accepted with the legacy `gates` map as
fallback; `skipped` / `advisory` / `timedOut` render distinctly. `--profile`
groups by `checks[].command` across every worktree's PER-RUN reports (not just
the latest) and reports fail/timeout/advisory/skipped counts alongside median,
p90 and max duration — the analysis `.tmp/mine-gates.ts` was written to do by
hand, now in the tool that already walks those files.

Two behaviours worth keeping in mind, both verified against the pinned build:
`--profile` reads every `check-report*.json` under each worktree's scratchpad,
so `--since` is what bounds the window (all-time otherwise), and a malformed
`--since` exits 1 with a usage message rather than silently profiling
everything. Note that `--profile` was silently IGNORED before `ec7425ee` — it
exited 0 and printed the plain listing, so a run that "succeeded" proved
nothing; the flag's absence from the output, not its exit code, is the signal.

**Why universal:** report shape and gate names are the project's, not loop-lore's.
The walk and the grouping are not.

### 4.3 `giwt clean` learns a fifth class driven by config

**Target:** `giwt/src/utils/scratch.ts` — extend `ScratchClass.name` and add a
generic `dir` class; `giwt/src/utils/settings-schema.ts` for the new key.

**Interface:**

```toml
[scratch.extra_dirs]
  harness = { path = ".harness", max_age_days = 30 }
  async_store = { path = ".tmp/async-store", max_age_hours = 24 }
```

`giwt clean` gains one row in its plan output and one knob in `giwt.toml`. The
hardcoded four classes stay as defaults.

**Must be opt-in, never a default.** Two existing exclusions are load-bearing
and a blanket "prune every append-only JSONL root" rule would break them: the
rebase skip ledger is placed to survive `giwt clean` on purpose
(`src/history/skips.ts:8-12`), and run records are deliberately moved under
`repoRoot` so a `finalize` does not delete its own evidence
(`src/utils/runlog.ts:10-13`). Opt-in keeps that guarantee intact: a project that
wants a path pruned declares it, and a project that wants durability simply
declares nothing.

**Why universal:** every agent tool that appends JSONL grows a root the pruner
does not know about, and the declaration is the same one line in any repo.
loop-lore's candidates are `.harness/` (append-only with a stated no-rotation
rationale, `src/harness/exec-log.ts:9-10`) and `.tmp/async-store/` — neither is
excluded for durability reasons, both are simply unknown to the scanner. B
already owns the scan-and-prune machinery.

### 4.4 Ledger retention becomes time-based, configurable

**Target:** `giwt/src/utils/ledger-core.ts:25` (`LEDGER_MAX_RECORDS`) and
`giwt/src/utils/ledger.ts:169` (the `slice(-N)` prune), plus
`giwt/src/utils/settings-schema.ts`.

**Interface:** `[ledger] max_records`, `[ledger] max_age_hours`. The append path
drops a record when it exceeds either bound. Both read paths — `giwt ledger`,
and C's `extensions/receipt/giwt-footer.ts` via `giwt-bridge.ts` — already cap
for display, so the render contract is unchanged.

**Why universal:** the count cap is right for a demo and wrong for a week of
agent work. The same fix applies to C's `RECEIPT_KEEP` and `MAX_LEDGER_ENTRIES`.

### 4.5 C: split the giwt bridge out of the receipt plugin

**Target:** move `extensions/receipt/giwt-{bridge,footer}.ts` and
`extensions/receipt/ledger-watch*.ts` behind an optional loader, and expose the
merged-footer contract (`receipt-join.ts` already treats the giwt footer as one
input among others).

**Interface:** the plugin already no-ops when giwt is absent for the cwd
(`extensions/index.ts:73`). Make the dependency explicit — a `[giwt]` block in
`<project>/.omp/receipt.toml` naming the ledger path — so a repo with no giwt
installs a plugin with no giwt code, and a repo with a non-loop-lore giwt points
at its own ledger path.

**Why universal:** `.ledger.jsonl` is a giwt convention, not a loop-lore one. The
receipt half (`receipt-parse`, `receipt-carry`, `receipt-doc`, `receipt-join`)
is already path-agnostic.

### 4.6 Gate scoping: `--gates` already exists; name the fast profile once

loop-lore's `--gates` / `--skip-gates` CSV (`AGENTS.md:48-52`, forwarded by
`giwt finalize`) is the right primitive and is already universal in shape. What
is missing is that the `check:fast` preset is a long inline CSV string pasted
into `package.json:65`. A project-generic answer is a `gates.toml` (or a
`[gates]` block in `giwt.toml`) that `giwt finalize --gates` and the project's
`check` script both read, so the fast profile is named once rather than pasted.

---

## 5. Harness recommendations

### 5.1 What the harness is

Two different things share the name; both are real.

**(a) The agent harness is omp.** `AGENTS.md:359` and
`.agents/skills/giwt-usage/SKILL.md:35-36` both describe it as the thing that
"reroutes raw `git` invocations to `giwt git`". That mechanism is concrete:
`giwt/src/commands/git.ts:36` (`gitPassthrough`) classifies each argv via
`giwt/src/git/policy.ts` (allowlist plus destructive/GPG-bypass/config-write
guard), and in C the rewriting itself is
`plugins/oh-my-pi-integration/hooks/pre/git-giwt-reroute.ts` with
`hooks/pre/harness-evasion-guard.ts` blocking `command git`, `builtin git`,
`bash -c 'git …'`, and full-path forms over intercepted binaries.

**(b) `src/harness/` is not the agent harness.** It is loop-lore's LLM-egress
exec log:

| File | Role |
| --- | --- |
| `src/harness/exec-log.ts` | append-only writer for `.harness/executions.jsonl`; never throws |
| `src/harness/exec-recorder.ts` | called at the egress seam after every LLM call |
| `src/harness/query.ts` | bounded-tail reader (`MAX_LINES = 20_000`, `READ_WINDOW_BYTES = 4 MiB`) |
| `src/harness/stats.ts` | per-model / per-task-type / per-pattern rollup |
| `src/harness/types.ts`, `types-wire.ts`, `read-models.ts`, `run-context.ts` | record and wire types, runId correlation, git context |
| `src/routes/harness/index.ts` | admin-only HTTP read API |

`.tmp/harness-query/`, `.tmp/harness-recorder/`, and `.tmp/harness-routes/` are
**empty directories** — abandoned scaffolding whose names mirror
`src/harness/query.ts`, `src/harness/exec-recorder.ts`, and
`src/routes/harness/index.ts`. Nothing named `harness*` appears in `package.json`
scripts, and A's `.omp/` directory is empty. So: the scratch dirs named in the
brief are leftovers; the real harness tooling is `src/harness/` (application
side) plus the C-side reroute hooks (tooling side).

### 5.2 Lessons loop-lore has that the harness tooling does not yet absorb

**Slow finalize — the gates are the cost, not the merge.** The runner already
defaults to serial (`scripts/check-parallel.mjs:14-22`) because co-scheduled
gates OOM this host, and the header says so. Every finalize pays that. The
harness-side change is that `giwt finalize` should record, per run, which gate
dominated wall time — the data already exists as `checks[].durationMs`
(`scripts/check/parallel/report.mjs:201`) and is aggregated into
`summary.durationMs` but never attributed per finalize. `giwt report --profile`
(§4.2) is the reader.

**Post-merge validation — advisory is the current answer and it leaks.**
`AGENTS.md:53-58` explains why generated-artifact freshness gates are advisory:
they drift from concurrent dev-side merges and are "reconciled post-merge
anyway". The runner still prints `!!! ADVISORY FAILURES` and tells the agent to
re-run each by hand (`scripts/check/parallel/report.mjs:140-146`). That is a
manual loop with no receipt. The receipt plugin already has the primitive: an
`[[issue]]` entry with a `tooling` field
(`extensions/receipt/receipt.ts:11-12`), pruned after `RECEIPT_KEEP` carries.
Advisory gates should land there, not in prose.

**`.tmp/` sprawl — a hook, not a rule.** `util/tmp-write-tracker.ts` already
observes every `.tmp` write in-process and surfaces the list as
`session_artifacts` in the receipt. What it does not do is prune. The smallest
change that makes the harness useful here is a pre-finalize prune (§4.1): the
harness already knows the session's `.tmp` root and the worktree about to be
deleted.

**Gate OOM — the slot exists on the giwt side; the runner does not join it.**
`giwt finalize` Step 2 already sizes its check fanout from memory: Step 2 calls
`holdCheckFanoutSlot` (`giwt/src/commands/finalize/gates.ts:33`), which reads
`[doctor] memory_budget_mb` else `freemem()/2**20` and acquires a slot whose
capacity is `checkSlotCapacity(availableMemMb)`
(`gates.ts:53-74`; pool in `giwt/src/utils/check-slots`). Cross-worktree
serialization is therefore already memory-derived — on contention it *warns and
proceeds* rather than blocking. The gap is one level down: loop-lore's
`DEFAULT_JOBS = 1` in `scripts/check/parallel/runner.mjs:29` (documented at
`scripts/check-parallel.mjs:14`) is a flat `CHECK_JOBS` default that never
consults the slot the run was admitted under, so a finalize that wins a slot still
defaults to the most conservative fanout available. The smallest change is to
let the runner accept the memory figure its caller already computed.

### 5.3 Smallest set of changes that make the harness useful

1. ~~**Finalize-time scratch prune** (§4.1)~~ — **DONE**, shipped upstream in
   `ec7425ee` as Step 6a; turns a documented rule into an enforced one and
   retires the `.tmp` accumulation.
2. ~~**`giwt report --profile`** (§4.2)~~ — **DONE**, shipped upstream in
   `ec7425ee`; reads data the runner already writes and answers "which gate is
   actually costing us" without a scratch script.
3. **Advisory gates into the receipt** (§5.2) — still a PROPOSAL. Closes the
   post-merge loop with the existing `[[issue]]` primitive instead of printed
   instructions. Not shipped.
4. **Runner joins the slot it was admitted under** (§5.2) — still a PROPOSAL, and
   it is loop-lore-side: one function in `scripts/check-parallel.mjs` reading the
   memory figure giwt already computed, so the OOM lesson stops being tribal
   knowledge. Not shipped.

Items 3 and 4 are unrelated to the `report`/`--profile` work above and were NOT
delivered by it; do not read them as covered by `ec7425ee`. The remaining
giwt-side proposal in §4.3 (`[scratch.extra_dirs]`, a config-driven fifth
scratch class) is likewise still a proposal — `ec7425ee` shipped the finalize
prune in §4.1 but did not add a new class or a new config key.

---

## 6. Rejected ideas

**Promote every `.tmp` script into a repo command.** Most of them assert that a
specific edit landed. `verify-fixes.ts` and `chk.ts` were correct as throwaway
probes and are wrong as committed tests — the tests they wanted are already in
the tree. Promoting them trades a scratch file for permanent maintenance of a
frozen snapshot of one commit.

**Add `giwt scratch prune` as a new verb.** `giwt clean`
(`src/cli-registry.ts:84-87`) already owns scratchpad pruning with dry-run
default, per-class plans, and `--json`. A second verb splits the surface and
makes the docs the only place that knows which one is current.

**Make giwt's `plan validate` gates config-driven per repo.** The 11 gates assume
a `.plan/` directory with tickets, epics, a backlog, and a code map. Making them
conditional means every consumer — `finalize`, the plugin's `/bookkeep`, the
`plan:*` package scripts — grows a "which gates exist here" branch. The gating
is cheap; the branching is not.

**Move the `.plan/` layer out of giwt into a loop-lore plugin.** It would be the
architecturally clean split, but giwt's `plan`/`backlog`/`ticket`/`sync` are
already coupled to the same config, ledger, and run-record plumbing the generic
commands use. Splitting them is a rewrite of four commands for a boundary no
consumer currently asks about.

**Have the harness auto-write AGENTS.md or docs.** The harness already reads
`rules/*.md` and injects receipts. Having it write the repo's own prose means a
generated section nobody reviews, in the file `AGENTS.md:76` makes the top
precedence source of truth.

**Port `src/harness/` (the LLM exec log) into B or C as generic tool.** It records
loop-lore's LLM egress — model, task type, token cost, pattern. That is
application telemetry for this product, not agent-tooling telemetry. Keeping it
in `src/harness/` is correct; only its *retention* lesson (§4.3) is portable.

**Add time-based retention to `.harness/executions.jsonl`.** `exec-log.ts:9-10`
states the no-rotation choice deliberately: pruning deletes the old failures
worth mining. `.harness/` is gitignored (`.gitignore:76`), so it costs nothing to
keep. Revisit on size, not now.
