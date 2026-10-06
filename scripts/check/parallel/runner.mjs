// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 261

/**
 * Gate execution for the parallel check runner: concurrency cap resolution,
 * the giwt-unavailable skip marker, per-gate timeout budgets, single-check
 * execution, and the chunked light/heavy scheduler. Depends on the filtered
 * `checks` table exported by gates.mjs.
 */

import { DEFAULT_GATE_TIMEOUT_MS, runGateWithTimeout, } from "../gate-timeout.mjs";
import { MAX_OUTPUT_CHARS, PROJECT_ROOT, } from "./config.mjs";
import { NOOP_OK, } from "./context.mjs";
import { ADVISORY_GATES, checks, } from "./gates.mjs";

// ── Concurrency cap ────────────────────────────────────────────
// Resolve the per-run concurrency cap with priority: --jobs flag > CHECK_JOBS
// env > default 1 (serial). We refuse values < 1 (would deadlock) and cap at
// the check count to avoid the Promise.all-of-empty-array footgun. The cap
// exists so several worktrees (or several repos on the box) can run `bun run
// check` at once without the host hitting OOM — peak RSS scales ~linearly
// with concurrent checks.
//
// ponytail: 1 is the conservative default, not a measured optimum — agents
// finalize worktrees concurrently and co-scheduled heavy gates OOM-killed
// this host. An agent that wants a faster run passes --jobs N (or
// CHECK_JOBS=N) and owns the memory risk it takes on; the default never does.
const DEFAULT_JOBS = 1;
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
// resolvable from the gate's environment at all). When it fails, giwt degrades
// to "git issue CLI unavailable", then lists every issue it could not see as an
// actionable finding (~112 phantom findings) and exits 1. A gate that could not
// be evaluated is not a gate that failed: report it as skipped with the reason
// printed, never as a red gate carrying invented findings to "fix".
//
// ponytail: ceiling — on a host where the issue CLI is *permanently*
// unreachable the plan gates never gate .plan/ drift. The skip is printed on
// every run and recorded in the report, so it is visible rather than silent.
// Fail closed once upstream giwt returns a distinct exit code for "cannot
// evaluate" (BUG-giwt-plan-gates-report-112-phantom-actionable-issues-when-th).
export const GIWT_ISSUE_CLI_UNAVAILABLE = "git issue CLI unavailable";

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
  "e2e - browser (baseline)": 45 * 60 * 1000,
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
    // giwt case above: `true # diff-scope: no matching files` exits 0, so it
    // graded as PASS having run zero tests, and a `--diff-base` scope that
    // matched nothing printed `=== All checks passed ===`. AGENTS.md is the
    // governing convention — a gate that could not be evaluated is SKIPPED,
    // never passed — so the flag is set from an exact command match on NOOP_OK,
    // the marker the gate table already emits, with no parallel mechanism.
    //
    // `passed` is forced false alongside it because buildReport derives
    // failedCount as `total - passed - skipped`; a result that counted as both
    // would report a negative failed count. The giwt path keeps its existing
    // shape (already `!gate.ok`, so the two are disjoint there).
    const skipped = !gate.timedOut && (command === NOOP_OK ||
      (!gate.ok && gateOutput.includes(GIWT_ISSUE_CLI_UNAVAILABLE,)));
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

// Heavy gates (bun test processes: unit/e2e/coverage) each peak at multiple
// GB RSS. Two of them co-scheduled in one JOBS chunk OOM-kills the runner
// (observed: `test - unit` dying after ~300 bytes of output when chunked
// alongside the coverage run). They are therefore pulled out of the chunked
// pool and run strictly one-at-a-time after the light gates.
//
// `plan - ticket index (sync)` also rides the serial tail: its giwt ticket
// scan takes the index lock while `plan - validate` runs the same scan
// internally. Chunked together, the loser's scan dies under lock contention
// and reports a false "index out of sync" / truncated ticket-set (observed
// deterministically across three consecutive runs).
//
// `lint - eslint` joins them on footprint, not on measured causation: measured
// at ~1.5 GB peak with `--concurrency=8` (package.json), it is the largest
// light-pool gate by a wide margin, so chunking it beside other multi-GB work
// is the shape that co-scheduled OOMs took. Moving it here removes that
// exposure; it is not evidence that eslint caused any specific kill.
const HEAVY_NAMES = new Set([
  "coverage - per-module line %",
  "e2e - browser (baseline)",
  "plan - ticket index (sync)",
  "lint - eslint",
],);

export async function runAllChecks() {
  const allEntries = Object.entries(checks,);
  const entries = allEntries.filter(([name,],) => !HEAVY_NAMES.has(name,));
  const heavyEntries = allEntries.filter(([name,],) => HEAVY_NAMES.has(name,));
  const total = allEntries.length;
  console.log("=== loop-lore parallel check runner ===",);
  console.log(
    `Running ${total} checks with concurrency=${JOBS} (override via --jobs N or CHECK_JOBS=N)...\n`,
  );
  // Cap the number of in-flight light checks at JOBS. We schedule chunks of
  // size JOBS and await each chunk before starting the next; this keeps peak
  // RSS roughly bounded at JOBS × max-check-RSS instead of total × max-check-RSS.
  // Order is preserved per chunk so the report's per-check duration numbers
  // remain comparable across runs (the slowest check sits in the final chunk).
  //
  // We use `Promise.allSettled` rather than `Promise.all`: `runCheck` already
  // catches every check-level error into a `{ passed: false, output, ... }`
  // result object, so no promise should reject — but `allSettled` keeps the
  // chunk resilient to any future check that forgets its try/catch, and
  // makes the per-chunk invariant explicit (collect every result, no early
  // short-circuit on a single failure).
  const results = [];
  for (let offset = 0; offset < entries.length; offset += JOBS) {
    const chunk = entries.slice(offset, offset + JOBS,);
    const chunkResults = await Promise.allSettled(
      chunk.map(([name, command,],) => runCheck(name, command,)),
    );
    for (const settled of chunkResults) {
      if (settled.status === "fulfilled") {
        results.push(settled.value,);
        continue;
      }
      // `rejected` branch: `runCheck` catches every check-level error into
      // a `{ passed: false, output, ... }` result, so a rejection here means
      // a bug in `runCheck` itself (uncaught throw from `Bun.spawn` setup,
      // stream read, etc.). Synthesize a failing result so the rest of the
      // run can complete and the report still shows the anomaly.
      const reason = settled.reason;
      const message = reason instanceof Error
        ? `${reason.message}\n${reason.stack ?? ""}`
        : String(reason,);
      results.push({
        name: "(runner error)",
        command: "(see stack trace)",
        passed: false,
        exitCode: 1,
        output: message,
        durationMs: 0,
        truncated: false,
        timedOut: false,
      },);
    }
  }
  // Heavy gates strictly serial: each is a multi-GB bun test process; even
  // two concurrently can OOM (see HEAVY_NAMES above).
  for (const [name, command,] of heavyEntries) {
    results.push(await runCheck(name, command,),);
  }
  return results;
}
