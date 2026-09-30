// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bounded execution of one check gate.
 *
 * Lives in its own module (not inside `check-parallel.mjs`) so it is importable
 * without side effects: the runner executes `main()` at import time, which
 * would spawn the whole gate suite from a unit test. Here the only work is
 * spawn -> await -> kill-on-expiry, so the kill path is testable in isolation.
 *
 * BUG-parallel-check-runner-has-no-per-gate-timeout: the runner used to await
 * `proc.exited` with no deadline, so one wedged gate (a test runner blocked on
 * a lock, a tool waiting on a TTY prompt) kept the aggregate -- and therefore
 * `bun run check` and every `finalize` -- pending forever, with no way for the
 * parent to cancel. Every gate now has a deadline.
 */

/**
 * Default per-gate budget: 15 min. Generous for a whole-suite test run, short
 * enough that a wedged gate fails the run instead of hanging it. Gates needing
 * more carry their own budget (see `GATE_TIMEOUT_MS` in the runner) or the
 * operator raises the default with `CHECK_GATE_TIMEOUT_MS`.
 */
export const DEFAULT_GATE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Grace between SIGTERM and SIGKILL. A child that traps SIGTERM (or is stuck in
 * an uninterruptible syscall) still dies inside the grace window.
 */
const KILL_GRACE_MS = 5 * 1000;

/**
 * How long to keep draining a dead gate's pipes before giving up on them.
 *
 * A descendant that outlived the kill and still holds the write end keeps
 * `Response.text()` pending forever, which would put the aggregate right back
 * where the ticket found it. The gate is already dead at this point, so its
 * output is whatever is buffered; a second is generous for that.
 */
const DRAIN_GRACE_MS = 1000;

/**
 * `setsid` (util-linux) puts the gate in its own process group, so a signal to
 * `-pid` reaches the whole tree instead of just the shell. Absent on macOS and
 * in slim containers; without it the kill degrades to the direct child and the
 * drain grace is what keeps the run bounded.
 */
const SETSID_BIN = Bun.which("setsid",);

/**
 * Run `command` under bash with a hard deadline.
 *
 * On expiry the child gets SIGTERM, then SIGKILL after `KILL_GRACE_MS`, and the
 * result is marked `timedOut: true` with `ok: false` -- a timeout is a gate
 * failure, never a rejection.
 *
 * @param {object} options
 * @param {string} options.name Gate name, echoed in the result for callers.
 * @param {string} options.command Shell command string.
 * @param {number} options.timeoutMs Budget in ms.
 * @param {string} [options.cwd] Working directory for the child.
 * @returns {Promise<{name: string, ok: boolean, exitCode: number|null, stdout: string, stderr: string, durationMs: number, timedOut: boolean}>}
 * @throws {Error} If the child process cannot be spawned at all.
 */
export async function runGateWithTimeout({ name, command, timeoutMs, cwd, },) {
  const startedAt = performance.now(),
    // `setsid` execs rather than forks (it only forks when it is already a
    // process-group leader, which a freshly spawned child is not), so `proc.pid`
    // stays the group leader and `proc.exited` still tracks the gate itself.
    proc = Bun.spawn([...(SETSID_BIN ? [SETSID_BIN,] : []), "bash", "-c", command,], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    },),
    // Both pipes are drained concurrently with the exit wait: awaiting `exited`
    // first lets a chatty child fill the 64 KiB pipe buffer and deadlock.
    stdoutRead = new Response(proc.stdout,).text(),
    stderrRead = new Response(proc.stderr,).text();

  // Signal the gate's whole process group so descendants die with it -- a
  // wedged `bun test` spawns workers that would keep burning CPU and RSS on a
  // host already at its OOM ceiling. Falls back to the direct child when
  // `setsid` is unavailable (macOS, slim containers) or the group is gone.
  const killTree = signal => {
    if (SETSID_BIN) {
      try {
        process.kill(-proc.pid, signal,);
        return;
      } catch (error) {
        if (error.code === "ESRCH") { return; }
      }
    }
    proc.kill(signal,);
  };

  let timedOut = false,
    hardKillTimer;
  const deadlineTimer = setTimeout(() => {
    timedOut = true;
    killTree("SIGTERM",);
    hardKillTimer = setTimeout(() => killTree("SIGKILL",), KILL_GRACE_MS,);
  }, timeoutMs,);

  let exitCode;
  try {
    exitCode = await proc.exited;
  } finally {
    clearTimeout(deadlineTimer,);
    clearTimeout(hardKillTimer,);
  }

  // A surviving descendant can hold the pipe open indefinitely, so the drain
  // is bounded. Without this the helper hangs exactly like the unbounded await
  // it exists to remove -- the gate is already dead, so whatever is buffered is
  // all the output there ever will be.
  let drainTimer;
  const [stdout, stderr,] = await Promise.race([
    Promise.all([stdoutRead, stderrRead,],),
    new Promise(resolve => {
      drainTimer = setTimeout(() => resolve(["", "",],), DRAIN_GRACE_MS,);
    },),
  ],);
  clearTimeout(drainTimer,);
  return {
    name,
    ok: !timedOut && exitCode === 0,
    exitCode,
    stdout,
    stderr,
    durationMs: Math.round(performance.now() - startedAt,),
    timedOut,
  };
}
