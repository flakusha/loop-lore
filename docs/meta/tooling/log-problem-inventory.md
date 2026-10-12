<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Log Problem Inventory

Recurring failure signatures observed across the check-run artifacts left in
`.tmp/`, classified by root cause, with the tooling controls that would have
caught or removed each class.

**Where the fixes live.** Both entries below are now on `dev`, and this page
travels with them. The `chat-export.test.ts` directory require was replaced by a
static import in `97c47a10e` and the `local/no-extensionless-require` rule,
its test, and the `eslint.config.mjs` registration landed in `5a9e80a3a` — both
originally on `fix-unhandled-test-json-parse`, rewritten by its rebase onto
`dev`. The `gates-scope.mjs` diff-scoped lint feature described in
[finalize-speedup.md](./finalize-speedup.md) landed in `bc2f3f405` from
`finalize-perf`.

Per **AGENTS.md** (`AGENTS.md:109`, "Docs: Avoid quantitative metrics in
documents"), the only numbers here are the
integers in the table's "Runs" column, and they are **distinct run counts over
a retention window**, not rates or totals. Everything else is qualitative.
Regenerate the column with the scripts in
[How to recompute](#how-to-recompute) before quoting it; `.tmp/` is pruned, so a
number copied from here goes stale.

## How to recompute

**Read this before running anything below.** The `mine-*.ts` scripts are
uncommitted scratch in `.tmp/` — they were never in git, so a fresh clone, a
`giwt clean --apply`, or any scratch prune leaves you with nothing to run. The
corpus underneath them is *actively* retention-windowed and disappears without
anyone deleting it by hand: `scripts/check/parallel/retention.mjs` prunes
`.tmp/run-*/` dirs and old `.tmp/check-report-*.json` on every check run
(`REPORT_RETENTION_COUNT`, wired at `scripts/check/parallel/report.mjs:240-241`),
and `giwt clean`'s `check-report` class keeps only the newest
`checkReportKeep` reports. So **these commands reproduce this page only while a
comparable corpus happens to still be on disk.** Once it is gone the numbers
cannot be re-derived from the tree — that is the condition the table's "Verified
in" column encodes, and a row whose artifact is missing is unverified by
definition, not approximately right.

Durable replacement: **not shipped.** Cross-run gate-frequency mining — what
step 1 below does by hand — is being generalized into `giwt report --profile`
in the giwt repo (proposal in
[tooling-unification.md](./tooling-unification.md) §4.2). Until that lands, the
scratch scripts are the interim and this section is the record of what they did.

```bash
# 1. Gate outcome table: one row per gate, pass/fail/skip/timeout per report.
bun .tmp/mine-gates.ts > .tmp/mine-out-gates.txt

# 2. Raw failure signatures from every report's gate output plus every
#    .tmp/run-<id>/check-fail-<slug>.log, grouped by normalized line.
bun .tmp/mine-signatures.ts > .tmp/mine-out-signatures.txt

# 3. The verified table this page documents. Every row is proven by re-reading
#    the named artifact and matching a literal substring; a row whose artifact
#    is missing, or whose needle does not match, is reported as an evidence
#    problem and MUST NOT be quoted as fact.
bun .tmp/mine-table.ts > .tmp/mine-out-table.txt

# 4. Attribute "Unhandled error between tests" blocks to the test file that
#    precedes them, so a repeated error is not counted once per repetition.
bun .tmp/mine-unhandled.ts \
  .tmp/run-803973-mv4q9jdu/check-fail-coverage-per-module-line.log \
  > .tmp/mine-out-unhandled.txt

# Helper: inspect the top-level shape of a check-report JSON before mining it.
bun .tmp/mine-shape.ts .tmp/check-report-803973-mv4q9jdu.json
```

Inputs consumed: `.tmp/check-report-<id>-<run>.json` (`checks[].command`,
`.passed`, `.output`, `nonBlocking[]`), `.tmp/run-<id>/check-fail-<slug>.log`,
and the loose top-level logs `.tmp/fin2.log`, `.tmp/ewr-final-check.log`,
`.tmp/check-dev-final.log`, `.tmp/fullcheck.log`.

## Signature inventory

Categories: **product bug**, **test-infra flake**, **gate/tooling defect**,
**environment**.

| Signature | Category | Runs | Gate | Verified in |
| --- | --- | --- | --- | --- |
| Unhandled JSON parse error, one per test file | test-infra flake | 1 | `coverage - per-module line %` | `.tmp/run-803973-mv4q9jdu/check-fail-coverage-per-module-line.log` (one block at log lines 1034-1044 carries a stack; the rest do not) |
| Directory-`require()` in a test falls through to Bun's JSON loader | product bug | 1 | `coverage - per-module line %` | `src/routes/chat-export.test.ts:7` (`require("./chat-export")`) — **fixed** (`97c47a10e`, now a static import); the class is blocked by the `local/no-extensionless-require` lint rule (`5a9e80a3a`, see P9) |
| knip reports unused `src/` files | gate/tooling defect | 1 | `dead - code (src files)` | `.tmp/run-1488199-mv4sis10/check-fail-dead-code-src-files.log` (artifact since pruned from `.tmp/`; the gate's own ADVISORY_GATES comment in `gate-table.mjs` carries the same finding independently) |
| Plan validator orphan-epic-binding advisory storm | gate/tooling defect | 2 | `plan - validate` | `.tmp/run-634984-mv4p6425/`, `.tmp/run-746078-mv4pxrh5/check-fail-plan-validate.log`, `.tmp/ewr-final-check.log` |
| Plan ticket index out of sync | gate/tooling defect | 4 | `plan - ticket index (sync)` | `.tmp/run-628188-mv271rgk/`, `.tmp/run-691190-mv28empt/`, `.tmp/run-691937-mv28fh08/`, `.tmp/run-759936-mv29d0k5/check-fail-plan-ticket-index-sync.log` |
| Generated fuzz-test mirror stale | gate/tooling defect | 4 | `fuzz - generated tests` | `.tmp/run-628188-mv271rgk/`, `.tmp/run-691190-mv28empt/`, `.tmp/run-691937-mv28fh08/`, `.tmp/run-746078-mv4pxrh5/check-fail-fuzz-generated-tests.log` |
| jscpd clone count past baseline | gate/tooling defect | 4 | `jscpd ratchet` | `.tmp/run-628188-mv271rgk/`, `.tmp/run-691190-mv28empt/`, `.tmp/run-691937-mv28fh08/`, `.tmp/run-759936-mv29d0k5/check-fail-jscpd-ratchet.log` |
| `epics-index.md` stale vs fresh rebuild | gate/tooling defect | 3 | `plan - validate` | `.tmp/run-634984-mv4p6425/`, `.tmp/run-746078-mv4pxrh5/`, `.tmp/run-803973-mv4q9jdu/check-fail-plan-validate.log` |
| Broken internal link in the generated docs mirror | gate/tooling defect | n/a | none (`nonBlocking` md-links) | `.tmp/ewr-final-check.log` |
| `code-map.json` stale vs fresh rebuild | gate/tooling defect | 1 | `code-map - freshness` | `.tmp/run-750105-mv2fssx5/check-fail-code-map-freshness.log` |
| File over the 250L size budget | gate/tooling defect | 1 | `size - strict` | `.tmp/run-628188-mv271rgk/check-fail-size-strict.log`, `.tmp/ewr-final-check.log` |
| Unformatted committed file | gate/tooling defect | 1 | `format - dprint` | `.tmp/run-815513-mv3gdl6b/check-fail-format-dprint.log`, `.tmp/ewr-final-check.log` |
| New test gaps vs committed baseline | gate/tooling defect | 1 | `tests - coverage gaps` | `.tmp/run-628188-mv271rgk/check-fail-tests-coverage-gaps.log` |
| finalize blocked by untracked docs build artifacts | gate/tooling defect | n/a | none (finalize Step 1) | `.tmp/fin2.log` |
| Always-on advisory: frontend banned-pattern findings | gate/tooling defect | n/a | none (`nonBlocking`) | `.tmp/check-dev-final.log`, `.tmp/fullcheck.log`, `.tmp/ewr-final-check.log` |
| License scanner absent; check silently skips | environment | n/a | none (`nonBlocking`) | `.tmp/check-dev-final.log`, `.tmp/ewr-final-check.log` |
| Individual test assertions failing in full suite | product bug | 1 | `coverage - per-module line %` | `.tmp/run-803973-mv4q9jdu/check-fail-coverage-per-module-line.log` |
| `/tmp` sandbox leak per test run | environment | 1 | none (open git issue) | `.tmp/run-628188-mv271rgk/check-fail-plan-ticket-index-sync.log` |

### Reading the top of the table

**Unhandled JSON parse error, one per test file** dominates every other
signature by *volume*: in one run, one `# Unhandled error between tests` block
was emitted for essentially every test file in the suite, all carrying the same
message. Two things follow, and both are load-bearing:

- The failing tests are **not** the visible cause. The gate's console excerpt
  (head-5 + tail-20) showed a handful of `(fail)` lines; the mass-error block
  behind them was invisible without opening `check-fail-*.log` by hand.
- Because one error lands per test *file* rather than per test, it reads as
  suite-wide breakage while the per-file assertion counts stay low.

`.tmp/mine-unhandled.ts` attributes each block to the test-file header that
precedes it, which is what turns "N repeated lines" into "N distinct files".

**Status: one proved root cause, cascade OPEN.** Exactly one of the ~260 blocks
carries a source frame — log lines 1034-1044 — and it points at
`src/routes/chat-export.test.ts:7`, where `require("./chat-export")` names a
path that is a *directory*. Bun's CJS resolver can fall through to its JSON
loader and hand the resolved absolute path (a string starting with `/`) to the
JSON parser, producing exactly `Unrecognized token '/'`. That call is fixed and
the class is now blocked by the `local/no-extensionless-require` rule (P9).

The remaining ~260 blocks are **not reproduced and not explained**. A
comparable coverage run of the same tree exits `0 fail` with zero unhandled
blocks, and it executed a materially larger test set (19022 tests / 1537 files)
than the failing run (16600 tests / 1538 files) — so the two runs are **not
comparable**, and the cascade cannot be attributed to the proved cause. The
failing run's log survives at the `.tmp/` path above (stack at lines 1034-1044,
run summary `Ran 16600 tests across 1538 files`); no retained
`.tmp/check-report-*.json` carries the clean run's figures, which survive only
in that ticket's text — so the two counts are not re-derivable from the tree
today. Tracked in
`.plan/tickets/BUG-test-unhandled-json-cascade-unexplained-after-chat-export-fi.md`
(ticket id `BUG-test-unhandled-json-cascade-unexplained-after-chat-export-fi`;
it is not yet in `.plan/tickets/index.json`). Do not read the fix above as
closing this signature.

**knip reports unused `src/` files** is the one gate in the window that failed
on *every* run in which it executed. `gate-table.mjs` already documents this as
expected (`ADVISORY_GATES`, with a FLIP CONDITION), so the signal is known —
but the gate keeps paying full cost and emitting red rows for a state the repo
has already accepted.

**The mirror-drift signatures** (ticket index sync, generated fuzz mirror,
jscpd ratchet, `epics-index.md`, `code-map.json`) are one phenomenon wearing
several hats: a committed generated artifact drifts from its source while a
concurrent `dev` merge lands plan changes. The gates are correct; the
*workflow* around them is what recurs, and the per-signature run counts are in
`.tmp/mine-out-table.txt`.

## Proposed controls

### P1 — Signature digest instead of head/tail excerpt on test-gate failure

- **What:** when a `bun test` gate fails, group its output into normalized
  signatures and print the top ones (count, message, one source frame) rather
  than the first five and last twenty lines.
- **Where:** `scripts/check/parallel/report.mjs` builds the failure excerpt
  (`outputLines.slice(0, 5)` / `slice(-20)`) and is where the digest replaces
  it — a one-file change. The full, untruncated `stdout` is already in hand at
  that point: `scripts/check/gate-timeout.mjs` returns it from
  `runGateWithTimeout()` after a bounded drain, and the same function writes
  the complete text to the per-run `check-fail-<slug>.log`.
- **Not a duplicate:** no registered gate parses test *output* today.
  `scripts/check/coverage.mjs` reads `lcov.info` only and never sees stdout.
- **Failure mode it introduces:** a bad normalizer collapses two distinct
  errors into one signature and understates the failure. Guard: cap the
  normalizer at literal replacements (path, position, hex) with no regex
  rewriting, and always print the raw line count next to the signature count.
- **Effort:** S.

### P2 — Auto-regenerate committed mirrors in the pre-commit hook

- **What:** when the pre-commit hook sees staged edits to a mirror's *source*,
  run that mirror's generator and stage the regenerated output, so the
  freshness gates stop firing.
- **Where:** `.githooks/pre-commit` (already wired via `core.hooksPath`;
  `.githooks/pre-commit:full` is the unbucketed variant). The mirror sources
  are the validators already registered in
  `scripts/check/parallel/gate-table.mjs`: `db - schema gate`,
  `fuzz - generated tests`, `api - doc drift`, `plan - matrix`,
  `code-map - freshness`.
- **Not a duplicate:** every one of those gates **detects** drift after the
  fact. None **prevents** the commit that creates it. This moves the reconcile
  step from a post-merge chore to a commit-time step.
- **Failure mode it introduces:** a generator that is non-deterministic or
  environment-dependent makes every commit dirty, which trains agents to
  `--no-verify`. Guard: run the generator once and fail closed if a second run
  differs (idempotence check) before staging; skip silently when the generator
  is absent, mirroring how the license check degrades.
- **Effort:** M.

### P3 — Gitignore the VitePress temp dir; name generated untracked files

- **What:** `.gitignore` lists `docs/.vitepress/config.mjs`, `cache/`, and
  `dist/`, but not `docs/.vitepress/.temp/`. A docs build writes thousands of
  untracked files there, and `giwt finalize` Step 1 refuses to proceed on an
  untracked tree — so a docs build run between branch and finalize hard-stops
  the work behind a several-thousand-line error listing. Add the missing
  ignore entry, and a pre-commit line that names the generated dirs it skipped
  instead of leaving the operator to bisect the listing.
- **Where:** the `docs/.vitepress/` block in `.gitignore`; the guard goes in
  `.githooks/pre-commit`. The failure happens in `giwt finalize` Step 1, which
  runs *before* any gate, so no entry in `gate-table.mjs` can catch it.
- **Not a duplicate:** no registered gate inspects the untracked working tree.
- **Failure mode it introduces:** an over-broad ignore swallows genuinely new
  source. Guard: ignore the exact `docs/.vitepress/.temp/` path only — never a
  `docs/`-level wildcard — and have the pre-commit line print the ignored paths
  it skipped, so the omission stays visible.
- **Effort:** S.

### P4 — Ratchet the dead-src-file gate instead of leaving it permanently red

- **What:** convert "this gate is red and will stay red until the debt is
  paid" into a ratchet: fail only when the dead-file count *rises*, and report
  the count on the way down.
- **Where:** new `scripts/check/dead-files-ratchet.mjs`, modelled directly on
  `scripts/check/jscpd-ratchet.mjs` (same `--baseline` / `--update` shape, same
  baseline-file-only source of truth), with its baseline beside
  `scripts/check/jscpd-baseline.json`. Registered as the replacement command for
  `"dead - code (src files)"` in `scripts/check/parallel/gate-table.mjs`, whose
  FLIP CONDITION comment becomes the ratchet contract.
- **Not a duplicate:** `jscpd ratchet` counts *clones*;
  `dead - code (src files)` counts *unreachable files*. The second has no
  ratchet, which is precisely why it needs its own.
- **Failure mode it introduces:** the baseline drifts up whenever someone
  accepts debt casually, so the gate can decay into a no-op. Guard: mirror
  `jscpd-ratchet.mjs` — `--update` **refuses to raise** the baseline, so the
  number only ever falls and raising it stays an explicit, reviewable edit.
- **Effort:** S.

### P5 — Promote the advisory frontend banned-pattern buckets to oxlint rules

- **What:** the `nonBlocking` frontend report emits the same buckets on every
  run regardless of whether anything changed, and its own header calls it an
  ESLint gap. Those heuristics (page-lifetime listener registration,
  `storage-no-try`, `fetch-no-catch`, `void-fire-forget`) are expressible as
  oxlint correctness rules.
- **Where:** `oxlint.config.ts` already exists at the repo root (it enables
  `typescript`, `unicorn`, `import`, `oxc`, with `correctness` as error), and
  `bun run lint:oxlint` (`package.json:40`) reads it while additionally passing
  `--ignore-pattern '**/*.test.ts' --ignore-pattern tests`. So the config slot
  is taken and the rules are simply not written yet. What is missing is the
  *gate*: `lint - oxlint (banned patterns)` does not exist in
  `scripts/check/parallel/gate-table.mjs`, which is why the run is invisible to
  `bun run check` and is described as "manual; the canonical runner does not
  report it as correctness evidence" (`gate-table.mjs:29`). Add a `rules` block
  carrying those four findings to `oxlint.config.ts` and register the gate in
  `scripts/check/parallel/gate-table.mjs`, in `ADVISORY_GATES` initially.
- **Not a duplicate:** `lint - eslint` carries no such rules, and the advisory
  report says so itself. oxlint is already a devDependency and already wired to
  a script; this adds no install and no new process.
- **Failure mode it introduces:** a new lint ruleset blocks merges on patterns
  that are correct in some contexts, and the advisory report's own suppression
  count shows exactly that (page-lifetime listeners are suppressed as
  intentional). Guard: ship advisory, mirror the existing suppression list into
  the oxlint config, and promote only after a run where the finding count stops
  moving.
- **Effort:** M.

### P6 — Per-run `TMPDIR` for the test scripts

- **What:** point `bun test` at a per-run temp directory so fixtures cannot
  collide across concurrent runs or accumulate across successive ones.
- **Where:** the `test`, `test:coverage`, `test:unit`, and `test:e2e` scripts
  in `package.json`, or the gate commands assembled by
  `scripts/check/parallel/gates.mjs` so the scoped and full invocations cannot
  disagree.
- **Not a duplicate:** no registered gate sets `TMPDIR`. The concern exists
  only as an open git issue surfaced inside the
  `check-fail-plan-ticket-index-sync.log` issue listing.
- **Failure mode it introduces:** a test that hardcodes `/tmp` keeps sharing state, and a cleanup step that races a still-running sibling. **Resource contract:** a test owns its temp directory and nothing else. Concretely — a unique directory per *test*, not per run (`bun test` parallelizes within one invocation, so per-run is still shared); allocate in `beforeEach` via the runner's tmp facility or `mkdtemp`, never a fixed path; release in `afterEach` **and** in a `finally` on the test body, so a failed test cannot leak into its siblings; no shared globals or module-level mutable scratch; each test must pass alone and in any order. Process-wide teardown on a shared timer is forbidden — it deletes a sibling's directory mid-run.
- **Effort:** S.

### P7 — Property-test the reconcilers, not just the schemas

- **What:** `fast-check` is installed and used, but only inside
  `src/test-utils/schema-arbitrary*.ts` and the generated
  `src/validation/schema-fuzz.generated.test.ts` — that is, only for JSON-Schema
  validation. There is no property test anywhere under `tests/`. The
  reconciliation logic behind several of the signatures above (plan index /
  ticket / git-issue agreement, ticket-index status and orphan detection) is
  pure structural code and the natural next target: generate a ticket set, run
  the reconciler, assert the reported findings match what the generator planted.
- **Where:** new property tests under `tests/`; if they should be gated, add a
  `tests - property` entry to `scripts/check/parallel/gate-table.mjs` running
  `bun test tests/property/`.
- **Not a duplicate:** `fuzz - generated tests` only checks that the committed
  generated mirror matches its generator. It never asserts the *reconcilers*
  are correct — and a wrong reconciler generates a wrong mirror that then
  passes the freshness check forever.
- **Failure mode it introduces:** a fuzzer that hangs the gate; coverage that flatters itself by only exercising the generator's own shape; and — the easy one to miss — generated state that leaks across cases. Guard: fixed `numRuns` with a committed seed, a per-case timeout, and generators seeded from committed corpora so a counterexample is replayable. **Resource contract:** each generated case owns its own fixture (tickets, index, issue stubs) and allocates a unique path per case rather than rewriting one shared fixture — `fast-check` shrinks and replays, so a shared mutable fixture makes a failure unreproducible. Reconciliation runs must be pure over their input, or each case gets its own directory allocated in `beforeEach` and released in `afterEach` plus a `finally` on the body. No ordering dependence: a case must pass alone.
- **Effort:** M.

### P8 — Emit `nonBlocking` lines only on change

- **What:** the license line ("Neither scancode nor fossa installed - skipping")
  and the frontend banned-pattern report are byte-identical on every run.
  Print them only when their content differs from the previous report, so the
  `nonBlocking` section carries signal.
- **Where:** `scripts/check/parallel/nonblocking.mjs` collects the frontend
  banned-pattern, markdown-link, and license notes; `buildReport()` in
  `scripts/check/parallel/report.mjs` serializes them into the report's
  `nonBlocking` array. Compare against the previous
  `.tmp/check-report-<id>.json` at write time — the report is already on disk
  by then.
- **Not a duplicate:** no gate compares a report to a previous report.
- **Failure mode it introduces:** a first run has no predecessor and would
  print nothing, hiding a real finding. Guard: always print when no previous
  report is available, and keep the full content in the JSON — only the stdout
  rendering is suppressed.
- **Effort:** S.

### P9 — Reject extensionless `require()` in test files

- **What:** a `require()` in a test file whose specifier is relative and whose
  final path segment carries no file extension. `require("./chat-export")` is
  ambiguous: when it resolves to a directory, Bun's CJS resolver can fall
  through to its JSON loader and parse the resolved absolute path, throwing
  `SyntaxError: JSON Parse error: Unrecognized token '/'`. Requiring an explicit
  entrypoint (`"./chat-export/index.ts"`) or using a static import removes the
  ambiguity structurally, because a specifier with an extension can never be
  re-interpreted as a directory.
- **Where:** `src/eslint-rules/no-extensionless-require.mjs`, registered in the
  existing inline `localPlugin` in `eslint.config.mjs` beside
  `local/options-object-params` and enabled as `"error"` in the same rules
  block. Unit tests: `src/eslint-rules/no-extensionless-require.test.ts`. Shipped
  in `5a9e80a3a` (rebased from `fix-unhandled-test-json-parse`, where it was
  `d02582f7`).
- **Why ESLint and not oxlint:** the repo is mid-migration to oxlint (P5), but
  oxlint's rule set is fixed — it has no mechanism for a project-local AST rule,
  and `oxlint.config.ts` cannot host one. ESLint already carries the repo's
  precedent (`options-object-params.mjs`), so this adds a second local rule to an
  established slot rather than a second linting mechanism. Cost: the rule runs
  inside the `lint - eslint` process, which the repo deliberately keeps to a
  single invocation.
- **Not a duplicate:** `lint - eslint` had no rule for specifier shape. It is
  scoped to `.test.`/`.spec.` files and self-guards on the filename, so
  production `require("htmx.org/dist/ext/alpine-morph.js")` calls and the
  `require` that merely shadows the global as a function parameter
  (`src/routes/worlds/location-edges.ts:110`, the shadowing parameter, called at
  `:113`) are untouched.
- **Failure mode it introduces:** **false positives on legitimate extensionless
  requires.** A test that genuinely wants the package entrypoint resolved for it
  — or a directory require that works today and is renamed later — is now a lint
  error. Accepted, and bounded three ways: `node:`/`bun:` builtins and a
  known-package allowlist are exempt; only *relative* specifiers are judged; and
  a computed specifier (`require(name)`) is skipped, since it has no static
  extension to check. The remedy — a static import — is what the test should
  have written anyway, so the fix is cheaper than the violation. The residual
  cost is that a legitimately extensionless *relative* require now needs an
  inline `eslint-disable`; at time of writing the rule flagged exactly one
  pre-existing call (`src/personas/service.coverage.test.ts`, then line 6), which
  was converted to a static import alongside the rule.
- **Effort:** S (done).

## Rejected proposals

| Proposal | Why rejected |
| --- | --- |
| A new "generated artifacts are stale" umbrella gate | Every mirror already has its own registered gate (`db - schema gate`, `fuzz - generated tests`, `api - doc drift`, `plan - matrix`, `code-map - freshness`, `plan - ticket index (sync)`). An umbrella would duplicate all six while detecting nothing new. P2 fixes the cause instead. |
| Promote `jscpd ratchet` from advisory to blocking | It is advisory by explicit decision, and `gate-table.mjs` records why: the baseline drifts under concurrent `dev` merges. Blocking it converts a known merge-race into a merge-blocker. P4 addresses the analogous dead-file gate by ratcheting, not by escalating. |
| Property-test the JSON-Schema layer harder | That is what `src/validation/schema-fuzz.generated.test.ts` already does, generated from the schema modules and gated by `fuzz - generated tests`. More of the same targets the one area already covered. |
| Raise the coverage floor above the current per-module floor | `scripts/check/coverage.mjs` floors per diff-touched file precisely because module aggregates computed from a scoped lcov are structurally unpassable. A higher floor on the same data produces false red, not better coverage. |
| Catch the `/tmp` leak with a `dead - code (knip)` rule for temp paths | knip resolves imports, not filesystem side effects. The leak is a runtime behaviour of fixtures, invisible to a static reachability scan. P6 sets `TMPDIR` instead. |
| Make the unhandled-JSON-parse class a new blocking gate | It already fails the run — the test gate's exit code is non-zero. What was missing was the *diagnostic*, not a detector. P1 supplies the digest; a new gate would only duplicate the existing failure. |
| Convert the advisory frontend report into `lint - eslint` rules | ESLint 10 with the repo's plugin set already runs project-wide and is the canonical entry; adding overlapping custom rules there risks the 1.5GB RSS peak that motivated consolidating to a single ESLint invocation. P5 uses oxlint, a separate process. |

## Negative space

Three things this inventory deliberately does **not** claim:

- **The root cause of the ~260-block cascade is still unknown.** One block
  does carry a stack — `src/routes/chat-export.test.ts:7` — and that call site
  is fixed and now lint-blocked (P9). But a comparable run of the same tree
  reproduces none of the cascade, so the remaining blocks are unexplained; the
  only shape-level observation is that they begin immediately after
  `src/async/offload-daemon.test.ts` logs `[ERROR] [async-offload] offload spill
  failed` and recur under nearly every subsequent file header, which is
  consistent with a single unhandled rejection re-reported per file under
  `--parallel=4`. Ruled out by direct experiment: the `bunfig.toml` preload
  (`tests/setup-globals.ts` performs no `JSON.parse`), config/env discovery (no
  config file at either repo root; `loadConfig` throws on a missing NSFW secret
  before reaching any parse), and a JS-global `JSON.parse` trap that fired zero
  times across a 1537-file run — which also shows Bun's native loader parses
  bypass the JS global. P1 remains a diagnostic, not a fix.
- **The proved cause was never reproduced as a red.** The
  `chat-export.test.ts` fix rests on the logged stack plus the directory-shape
  argument; three constructed fixtures (directory with `index.js`, directory
  with no `index`, absolute directory path) all resolved or failed with
  `Cannot find module`, and none produced the JSON parse error. The evidence
  basis is the log, not a local repro.
- **Absence from this table is not absence from the problem.** `.tmp/` holds a
  bounded retention window (`REPORT_RETENTION_COUNT`, per AGENTS.md) plus one
  sibling worktree's artifacts. A signature that never fired inside the
  retained window would not appear here, and none of these counts is a rate.
