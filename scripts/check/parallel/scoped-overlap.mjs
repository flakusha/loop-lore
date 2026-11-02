// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bash construct that runs two gate commands CONCURRENTLY and reports the
 * first failure's own exit code.
 *
 * The gate command is executed through `bash -c`
 * (scripts/check/gate-timeout.mjs), so the shell semantics below are the
 * runner's own — no wrapper process, no extra spawn layer.
 *
 * Why the overlap is safe: the two halves touch DISJOINT state — the collision
 * companion writes no coverage output, the scoped pass writes the lcov the
 * floor gate reads — and the scoped coverage gate's measured wall time fell
 * from 397s to 205s when they ran side by side on the dev host (188s and 209s
 * on their own).
 *
 * Exit codes: the group exits with the FIRST failing command's own code, so a
 * command that could not even start (bash 126/127) keeps the "could not
 * start" signal the runner reads instead of collapsing into a generic 1.
 */
export function overlapCommands(first, second,) {
  return `{ ${first} & p1=$!; ${second} & p2=$!; wait $p1; s1=$?; wait $p2; s2=$?; [ $s1 -eq 0 ] || exit $s1; [ $s2 -eq 0 ] || exit $s2; }`;
}

/**
 * The scoped coverage gate's command: the collision companion and the scoped
 * pass side by side, then the floor over the lcov the scoped pass wrote.
 *
 * Without a companion (a diff that touches no subsystem test dir) the scoped
 * pass runs alone.
 */
export function scopedCoverageCommand({ companionRun = "", scopedRun, floorRun, }) {
  if (companionRun.length === 0) { return `${scopedRun} && ${floorRun}`; }
  return `${overlapCommands(companionRun, scopedRun,)} && ${floorRun}`;
}
