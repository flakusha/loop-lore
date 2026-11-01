// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 280

/**
 * Gate execution for the parallel check runner: concurrency cap resolution,
 * the giwt-unavailable skip marker, per-gate timeout budgets, single-check
 * execution, and the chunked light/heavy scheduler. Depends on the filtered
 * `checks` table exported by gates.mjs.
 */

import { DEFAULT_GATE_TIMEOUT_MS, runGateWithTimeout, } from "../gate-timeout.mjs";
import { MAX_OUTPUT_CHARS, PROJECT_ROOT, TEST_POOL, } from "./config.mjs";
import { noopReason, } from "./context.mjs";
import { ADVISORY_GATES, checks, TEST_CHUNK_GATE_NAMES, } from "./gates.mjs";

// ── Concurrency cap ────────────────────────────────────────────
// Resolve the per-run concurrency cap with priority: --jobs flag > CHECK_JOBS
// env > default 4. We refuse values < 1 (would deadlock) and cap at the check
// count to avoid the Promise.all-of-empty-array footgun. The cap bounds only
// the LIGHT pool — every heavy gate is `await`ed one-at-a-time in
// runAllChecks and never reads JOBS, so no value here can start two bun tests.
//
// Measured during a real `giwt finalize` at JOBS=1, on 61 GiB (52.3 available):
// peak 11.93 GB total, peak single process 2.79 GB (tsgo). At JOBS=4 the light
// pool's four heaviest gates sum to ~9.4 GiB (backend 3.1 + coverage 2.8 +
// scripts 2.4 + knip 1.1) — no more than JOBS=1 already reaches, because one
// tsgo gate alone spawns enough children to get there. Wall time gains little
// (light gates finish in <15s; the run is dominated by the serialized heavy
// tail), so 4 buys headroom symmetry, not speed.
//
// ponytail: 4 is measured-safe, not measured-optimal. Two concurrent worktrees
// each at JOBS=4 (~19 GiB) plus one worktree's cold eslint (~19 GB) and its
// serialized coverage/e2e gates fit the 52.3 GiB available; three concurrent
// finalizations on heavy gates is the shape that has NOT been re-measured.
// Pass --jobs N to take that on explicitly.
const DEFAULT_JOBS = 4;
function parseJobs() {
  const flagIdx = process.argv.indexOf("--jobs",);
  let raw;
  if (flagIdx !== -1 && flagIdx + 1 < process.argv.length) {
    raw = process.argv[flagIdx + 1];
  } else if (process.env.CHECK_JOBS !== undefined) {
    raw = process.env.CHECK_JOBS;
  } else {
    raw = `${DEFAULT_JOBS}`;
  }
  const parsed = Number.parseInt(raw, 10,);
  if (!Number.isFinite(parsed,) || parsed < 1) {
    console.error(
      `warn: Invalid --jobs/CHECK_JOBS value ${JSON.stringify(raw,)}; falling back to ${DEFAULT_JOBS}.`,
    );
    return DEFAULT_JOBS;
  }
  if (parsed > DEFAULT_JOBS) {
    console.error(
      `note: concurrency ${parsed} is above the default of ${DEFAULT_JOBS}; ` +
        `peak RSS scales with concurrent checks, and a second worktree running ` +
        `heavy gates at the same time OOMs this host.`,
    );
  }
  return parsed;
}
const JOBS = Math.min(parseJobs(), Object.keys(checks,).length,);

// giwt reconciles .plan/ against the git issue CLI by shelling out to
// `git issue ls --all --format oneline` with a hard 10s budget (~3.2k issues;
// the call measures 5.4s idle and 15.5s on a loaded box, and is not always
// resolvable from the gate's environment at all). When the CLI is genuinely
// MISSING, the gate cannot be evaluated at all, and giwt says so with the
// marker below. A gate that could not be evaluated is not a gate that failed:
// report it as skipped with the reason printed, never as a red gate carrying
// invented findings to "fix".
//
// The marker alone is NOT the discriminator (see `COULD_NOT_START_EXIT_CODES`):
// a gate that RAN and exited non-zero stays FAIL even when the phrase appears
// in its output as part of a larger diagnostic.
//
// ponytail: ceiling — on a host where the issue CLI is *permanently*
// unreachable the plan gates never gate .plan/ drift. The skip is printed on
// every run and recorded in the report, so it is visible rather than silent.
// Fail closed once upstream giwt returns a distinct exit code for "cannot
// evaluate" (BUG-giwt-plan-gates-report-112-phantom-actionable-issues-when-th).
export const GIWT_ISSUE_CLI_UNAVAILABLE = "git issue CLI unavailable";

// bash's exit codes for "the shell could not EXEC the command": 127 command
// not found, 126 found but not executable. This is the only structural signal
// that a gate never STARTED, as opposed to ran and rendered a verdict.
const COULD_NOT_START_EXIT_CODES = new Set([126, 127,],);

// Per-gate budget overrides, keyed by gate name. Every gate NOT listed here
// gets the default (DEFAULT_GATE_TIMEOUT_MS, itself overridable by
// CHECK_GATE_TIMEOUT_MS). Only the genuinely slow gates are named: the browser
// baseline drives Playwright over the whole surface, and the coverage gate runs
// the suite under instrumentation. 15 min is already generous for the rest --
// the light-gate chunk finishes in seconds.
//
// ponytail: these are wall-clock budgets, not measured quantiles. A host that
// legitimately needs longer raises CHECK_GATE_TIMEOUT_MS once instead of
// widening this table gate by gate.
const GATE_TIMEOUT_MS = {
  "coverage - per-module line %": 30 * 60 * 1000,
  // The unit chunk IS the former mega gate's runtime (~97% of its test
  // files); it inherits the same 30-minute budget. The other chunk gates
  // measure 13-20s (e2e), 1s (plugins) and 35s (scripts) — the 15-minute
  // default is generous headroom for a loaded host.
  "tests - unit (src)": 30 * 60 * 1000,
  "e2e - browser (baseline)": 45 * 60 * 1000,
  "md - lint": 1200 * 1000,
};

/**
 * Resolve a gate's wall-clock budget: explicit per-gate entry, else
 * CHECK_GATE_TIMEOUT_MS, else the 15 min default. An invalid env value warns
 * and falls back rather than failing the run over a typo.
 */
function resolveGateTimeoutMs(name,) {
  const perGate = Object.hasOwn(GATE_TIMEOUT_MS, name,) ? GATE_TIMEOUT_MS[name] : undefined;
  if (perGate !== undefined) { return perGate; }
  const raw = process.env.CHECK_GATE_TIMEOUT_MS;
  if (raw === undefined) { return DEFAULT_GATE_TIMEOUT_MS; }
  const parsed = Number.parseInt(raw, 10,);
  if (!Number.isFinite(parsed,) || parsed < 1) {
    console.error(
      `warn: Invalid CHECK_GATE_TIMEOUT_MS value ${JSON.stringify(raw,)}; ` +
        `using ${DEFAULT_GATE_TIMEOUT_MS}ms.`,
    );
    return DEFAULT_GATE_TIMEOUT_MS;
  }
  return parsed;
}

// oxlint-disable-next-line func-style
// Exported so tests can drive the real advisory-flag wiring; a hand-built
// result in a test always carries `advisory`, so only runCheck catches a drop.
export async function runCheck(name, command,) {
  const startedAt = performance.now(),
    timeoutMs = resolveGateTimeoutMs(name,);

  try {
    const gate = await runGateWithTimeout({
        name,
        command,
        timeoutMs,
        cwd: PROJECT_ROOT,
      },),
      // `bun test` prints its banner on stdout and every failure detail on
      // stderr, so `stdout || stderr` reported a failing gate as one banner
      // line and hid the cause. Keep both streams whenever stderr has content.
      gateOutput = gate.stderr.trim() ? `${gate.stdout}${gate.stderr}` : gate.stdout || gate.stderr,
      // A killed gate produced no verdict of its own, so the reason has to be
      // synthesized: name the gate and the budget that expired. It goes at the
      // END because clipOutput keeps the tail of a long gate, and a wedged gate
      // is exactly the kind that floods stdout -- prepended, this line is the
      // first thing the report throws away.
      output = gate.timedOut
        ? `${gateOutput}\nTIMEOUT: gate ${
          JSON.stringify(name,)
        } exceeded its ${timeoutMs}ms budget and was killed. Raise the budget with CHECK_GATE_TIMEOUT_MS=<ms>.`
        : gateOutput;
    // A NOOP command is a gate that could not be evaluated, exactly like the
    // giwt case above: `true # <reason>` exits 0, so it graded as PASS having
    // run zero tests, and a `--diff-base` scope that matched nothing printed
    // `=== All checks passed ===`. AGENTS.md is the governing convention - a
    // gate that could not be evaluated is SKIPPED, never passed - so the flag
    // comes from the marker PREFIX (`true #`), not an exact string: a gate with
    // no Rust toolchain skips for a different reason than an empty diff scope,
    // and matching only NOOP_OK would grade the first one PASSED.
    //
    // `passed` is forced false alongside it because buildReport derives
    // failedCount as `total - passed - skipped`; a result that counted as both
    // would report a negative failed count. The giwt path keeps its existing
    // shape (already `!gate.ok`, so the two are disjoint there).
    // A gate that could not START — the shell never exec'd its tool — has no
    // verdict of its own, so it is SKIPPED. The exit code is the structural
    // evidence: bash answers 126/127 exactly when it could not exec. A gate
    // that RAN and exited non-zero (1, 3, ...) DID render a verdict, so it
    // stays FAIL even when the giwt marker appears in its output.
    //
    // The marker still scopes the reclassification to the known giwt condition:
    // without it, any gate whose binary was renamed (127) would silently skip
    // instead of failing — a new false-green in place of the old one.
    const skipped = !gate.timedOut && (noopReason(command,) !== "" ||
      (!gate.ok && COULD_NOT_START_EXIT_CODES.has(gate.exitCode,) &&
        gateOutput.includes(GIWT_ISSUE_CLI_UNAVAILABLE,)));
    // oxlint-disable-next-line sort-keys
    return {
      name,
      command,
      passed: !skipped && gate.ok,
      skipped,
      // Without this field buildReport's advisoryCount is 0, so every advisory
      // gate counts as a hard FAIL. Must be set in BOTH return paths below.
      advisory: ADVISORY_GATES.has(name,),
      output,
      exitCode: gate.exitCode,
      durationMs: gate.durationMs,
      truncated: output.length > MAX_OUTPUT_CHARS,
      timedOut: gate.timedOut,
    };
  } catch (error) {
    // oxlint-disable-next-line sort-keys
    return {
      name,
      command,
      passed: false,
      skipped: false,
      advisory: ADVISORY_GATES.has(name,),
      output: error.message,
      exitCode: 1,
      durationMs: Math.round(performance.now() - startedAt,),
      truncated: false,
      timedOut: false,
    };
  }
}

// Three scheduling pools, by measured footprint (see AGENTS.md Verification
// Gates for the numbers behind each line):
//
// LIGHT pool — everything that is not a bun test and not a memory monster:
// chunked by a work queue at JOBS slots (default 4; peak measured ~9.4 GiB).
// A slot that frees starts the next gate immediately, so a slow gate no
// longer drags three fast chunk-mates down with it the way the old fixed
// chunks of JOBS did.
//
// TEST pool — the four `bun test` chunk gates carved out of the former
// coverage mega gate (unit/e2e/plugins/scripts). Each peaks multi-GB; at
// most TEST_POOL of them (default 2) are ever alive at once, so the total
// bun-test worker count stays a single knob away from the documented OOM
// shape (two FULL suites co-scheduled). Ordered longest-first: the unit
// chunk saturates its workers for the whole phase while the small chunks
// overlap its ramp-up and drain. In scoped (finalize) mode all four are
// skip-markers, so the pool drains instantly.
//
// SOLO tail — strictly one-at-a-time after both pools:
// coverage - per-module line %   merge+floor in plain mode; the scoped bun
//                                test run in finalize mode (the last bun
//                                test standing, never co-scheduled)
// lint - eslint                  19.4 GB peak cold — the largest gate on
//                                either side of the heavy line
// e2e - browser (baseline)       drives the whole Playwright surface; its
//                                spec-level pool (BROWSER_JOBS) launches
//                                real browsers, so it never shares the box
//                                with a bun-test worker
// plan - ticket index (sync)     takes the giwt index lock that
//                                `plan - validate` (light pool) also grabs;
//                                co-scheduling both is a measured false red
//
// Historical note (why serial at all): two bun-test gates co-scheduled in
// one JOBS chunk OOM-killed the runner (observed: `test - unit` dying after
// ~300 bytes of output when chunked alongside the coverage run). The pools
// preserve that invariant by construction: at most TEST_POOL bun-test
// processes exist, and everything else waits for them.
const TEST_POOL_NAMES = new Set(TEST_CHUNK_GATE_NAMES,);
const SOLO_GATE_NAMES = [
  "coverage - per-module line %",
  "lint - eslint",
  "e2e - browser (baseline)",
  "plan - ticket index (sync)",
];
const SOLO_GATE_SET = new Set(SOLO_GATE_NAMES,);

/**
 * Run `entries` with a bounded work queue: up to `slots` gates in flight,
 * the next starting the moment a slot frees. Results keep the ENTRIES'
 * order (never completion order), so the report stays comparable across
 * runs regardless of scheduling.
 */
async function runPool(entries, slots,) {
  const results = new Array(entries.length,);
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const i = next++;
      const [name, command,] = entries[i];
      results[i] = await runCheck(name, command,);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(slots, entries.length,), }, () => worker(),),
  );
  return results;
}

export async function runAllChecks() {
  const allEntries = Object.entries(checks,);
  const lightEntries = allEntries.filter(([name,],) => !TEST_POOL_NAMES.has(name,) && !SOLO_GATE_SET.has(name,));
  const testEntries = allEntries.filter(([name,],) => TEST_POOL_NAMES.has(name,));
  // SOLO order is the declared array, not registry order: the floor signal
  // lands before the browser suite, whatever order the table grew in.
  const soloEntries = SOLO_GATE_NAMES
    .filter((name,) => checks[name] !== undefined)
    .map((name,) => [name, checks[name],]);
  const total = allEntries.length;
  console.log("=== loop-lore parallel check runner ===",);
  console.log(
    `Running ${total} checks: light pool concurrency=${JOBS}, test pool concurrency=${TEST_POOL}, then ${soloEntries.length} solo gate(s) (override: --jobs N / CHECK_JOBS=N, CHECK_TEST_POOL=N)...\n`,
  );
  const lightResults = await runPool(lightEntries, JOBS,);
  const testResults = await runPool(testEntries, TEST_POOL,);
  const soloResults = [];
  for (const [name, command,] of soloEntries) {
    soloResults.push(await runCheck(name, command,),);
  }
  // Reassemble in registry order so the report's row order is stable across
  // runs; a runner-level error result (runCheck always catches into a result
  // object, so these should not exist) is appended rather than dropped.
  const byName = new Map(
    [...lightResults, ...testResults, ...soloResults,].map((r,) => [r.name, r,]),
  );
  const ordered = [];
  for (const [name,] of allEntries) {
    const r = byName.get(name,);
    if (r !== undefined) {
      ordered.push(r,);
      byName.delete(name,);
    }
  }
  return [...ordered, ...byName.values(),];
}
