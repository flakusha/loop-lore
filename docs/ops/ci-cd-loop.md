<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# CI/CD loop

`bun run check` resolves to `check:parallel` → `scripts/check-parallel.mjs`
(`package.json:64-65`). Gate names and commands live in
`scripts/check/parallel/gate-table.mjs`; hosted entry points live in
`.github/workflows/`. Read those files for the current registry — this page
records today's wiring, not a frozen inventory.

## Gate matrix

- **Blocking by default.** A gate fails the run when its name is absent from
  `ADVISORY_GATES` (`scripts/check/parallel/gate-table.mjs:258-292`); any
  blocking FAIL exits non-zero (`scripts/check-parallel.mjs:93-96`).
- **Advisory gates run and report but never fail the run.** They are
  generated-artifact freshness checks that drift on concurrent dev merges:
  `plan - validate`, `briefing - pre-agent ticket quality`,
  `plan - ticket index (sync)`, `code-map - freshness`, `plan - matrix`,
  `plan - priority`, `jscpd ratchet`, `branches - audit`
  (`gate-table.mjs:258-291`). An advisory red prints as `ADVISORY:` and the
  runner says "NOT a clean run" rather than "All checks passed"
  (`scripts/check/parallel/report.mjs:118-123,140-151`;
  `scripts/check-parallel.mjs:98-111`).
- **Blocking families**: typecheck / lint / format / md
  (`gate-table.mjs:15-89`), wiring, DB schema, migrations and conflict markers
  (`130-159`), dead-code and API-doc drift (`99-139`), i18n (`195-204`),
  test-gap and coverage (`206-219`), frontend template / innerHTML guards
  (`220-226`), browser gates (`227-236`). `e2e - browser (qa subset)` is
  blocking by operator ruling; the full `e2e - browser (baseline)` is the
  heavy path (`gate-table.mjs:227-236`). The default `bun run check` skips
  only that heavy path; `check:ci` and `check:extended` (giwt finalize) run
  it, so CI and landing keep full enforcement.
- **SKIP means "not evaluated"**, not pass: empty diff scope, absent Rust
  toolchain, or unreachable issue CLI (`report.mjs:93-114`;
  `gate-table.mjs:67-76`). A missing Rust toolchain is a supported state —
  those gates skip with a reason instead of reddening the run.

## Workflow triggers

| Workflow | Trigger | Entry point |
| -------- | ------- | ----------- |
| `ci.yml` | push to master/dev/stg; PRs targeting them | `check:ci` gates job plus typecheck, lint, unit/E2E/browser, wasm and build jobs (`:7-11,25-33,97-98`) |
| `pr-checks.yml` | PR opened / synchronize / reopened | commit message validation (`:3-5,16-45`) |
| `smoke.yml` | push / PR to dev | `bun run smoke` fast gate; uploads `.tmp/check-report.json` (`:3-7,48-57`) |
| `nightly.yml` | daily cron, manual `workflow_dispatch`, PR labelled `nightly` | full `check:ci` plus report/test artifacts (`:11-17,40-49,95-105`) |
| `audit.yml` | weekly cron, manual dispatch | `bun audit` and RustSec (`:3-10,32-48`) |
| `deploy.yml` | push to dev, manual dispatch | VitePress Pages build/deploy (`:3-6,34-50`) |
| `release.yml` | push to master/stg/release/**, any tag | branch pushes verify only; tags publish GitHub Releases from CHANGELOG (`:3-25,113-123`) |
| `dev-release.yml` | merged PR to master/stg | `check:ci`, tests, build; `dev-*` prerelease with the `dev-release` label (`:3-6,19,53-60,138-142`) |

Manual heavy-gate dispatch is `workflow_dispatch` on `nightly.yml:14` (also
`audit.yml:10`, `deploy.yml:6`); `ci.yml` has no dispatch trigger. The
watchdog → heavy-gate webhook is still a planned task, not a shipped workflow
(`.plan/epics/epic-recursive-self-improvement.md:202`). Hosted jobs set
`CHECK_SKIP_GPG_PRECHECK=1`: the runner cannot do its trial sign without
credentials (`ci.yml:36-40`, `nightly.yml:45-49`).

## Reading `.tmp/check-report.json`

The runner writes the canonical report after every run, atomically
(last complete run wins), plus `.tmp/check-report-<RUN_ID>.json` and a
`.tmp/check-report.latest.json` symlink
(`scripts/check/parallel/config.mjs:16-29,52-57`;
`scripts/check/parallel/report.mjs:220-251`). It is git-ignored.

- Provenance: `schemaVersion`, `runId`, `mode`, `worktreeName`, `branch`,
  `gitHead`, `gitDirty`, `gpgPrecheck`, `profile`, `skippedByProfile`. Compare
  `gitHead` with the worktree's current HEAD before trusting a report
  (`report.mjs` provenance block).
- `summary`: `total`, `passed`, `skipped`, `advisory`, `failed`, `durationMs`.
  Top-level `passed` reflects blocking failures only — a run with red
  advisory gates can still say `passed: true` (`report.mjs:162-196`).
- `checks[]`: `name`, `command`, `passed`, `skipped`, `advisory`, `timedOut`,
  `exitCode`, `durationMs`, and `output` (clipped on failure; `truncated`
  flag) (`report.mjs:197-217`).
- `bun run check:report-ls` aggregates the latest report per worktree and
  flags reports stale against that worktree's HEAD
  (`scripts/check-parallel.mjs:47-48`). Stdout also emits greppable
  `CHECK_REPORT_PATH`, `CHECK_REPORT_LATEST`, `CHECK_REPORT_RUN_ID` lines
  (`report.mjs:254-270`).

## Scoped runs and cache knobs

- `bun run check --diff-base <ref>` scopes expensive gates to the branch diff:
  coverage to touched modules, browser baseline to edited specs. Whole-project
  static gates (typecheck, DB schema, dead-code) are unchanged
  (`scripts/check/parallel/context.mjs:20-24`). Space-form only:
  `--diff-base=<ref>` silently disables scoping (`context.mjs:42-44`).
- `--gates <csv>` whitelists gates; `--skip-gates <csv>` excludes them.
  Unknown names and bare flags are usage errors, never a silent full run
  (`context.mjs:35-52`).
- `--profile=<name>` / `--profile <name>` (`full`, `business-only`,
  `rpg-chat-only`, `local-only`, `relay-only`; default `full`) labels the run
  for provenance, not filtering: all five ship the same source tree, so every
  gate still runs in every profile. Unknown/empty values and `--profile`
  combined with `--gates` exit 2; `--skip-gates` composes. `PROFILE_SKIPS`
  (`gate-table.mjs`) is empty for all five profiles until a build manifest
  proves a source root absent, and only `e2e - browser (baseline)` is in
  `PROFILE_SKIPPABLE_GATES`. CI selects no profile and asserts the report says
  `profile=full`, zero `skippedByProfile` entries, and `summary.total` equal to
  the live registry size (`scripts/check/check-profile-provenance.mjs`,
  `ci.yml`).
- `--jobs N` / `CHECK_JOBS` cap light-pool concurrency; heavy gates are always
  serialized (`scripts/check-parallel.mjs:13-24`). Test parallelism:
  `CHECK_TEST_JOBS`, `CHECK_SRC_TEST_JOBS`, `CHECK_TEST_POOL`
  (`config.mjs:65-94`). Gate budgets default to the runner's constant, raised
  by `CHECK_GATE_TIMEOUT_MS`; per-gate budgets win, and expiry SIGTERMs then
  SIGKILLs the process group (`scripts/check-parallel.mjs:26-37`).
- Hosted caching is `actions/cache` on `~/.bun/install/cache` + `node_modules`
  keyed by `bun.lock` (`ci.yml:52-60`). Per-run scratch lives in
  `.tmp/run-<RUN_ID>/` (coverage lcov, jscpd output, failed-gate logs) and is
  pruned with report retention (`config.mjs:36-51`; `report.mjs:246-252`).

## Failure handling

1. Read the FAIL excerpt and its full log at
   `.tmp/run-<RUN_ID>/check-fail-<gate>.log`, then fix the cause
   (`report.mjs:64-83`). Do not weaken the gate.
2. Suspect load when a spec passes in isolation and in its standalone gate
   but fails inside the full suite; re-run unmodified on a quieter host rather
   than changing code or baselines (examples:
   `.tmp/intercom/FIXED-closeout-wave-3-finalize-2026-11-20.md:18`;
   `.tmp/intercom/FIXED-rsi-agent-actions-2026-11-20.md:16`).
3. An advisory red is not green: reconcile it after the dev merge and only
   add a gate to `ADVISORY_GATES` with proven merge drift
   (`gate-table.mjs:258-266`).
4. Never pass `--force` on finalize to bury a red check — it skips the check
   step (`docs/giwt-scripts-map.md:148`). Escalate instead.
