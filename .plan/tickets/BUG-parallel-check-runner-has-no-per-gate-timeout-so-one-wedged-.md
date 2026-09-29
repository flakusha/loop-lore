<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: parallel check runner has no per-gate timeout, so one wedged gate hangs bun run check forever

**Summary:** runCheck (scripts/check-parallel.mjs:697-738) spawns each gate with `Bun.spawn(["bash", ...commandParts])` and awaits `proc.exited` with no deadline. durationMs is recorded (L723) but nothing bounds the run.
**Context:** (none captured)
**Acceptance Criteria:** Implementation complete, tests passing, documentation updated.

**Status:** Not Started
**Priority:** high
**Effort:** Medium

## Summary

The runner fans out ~20 gates concurrently via Promise.all. A gate that never exits — a test runner waiting on a lock, a tsc stalled on a pathological file, a tool blocked on a TTY prompt — never settles, so the awaited aggregate never settles and `bun run check` (and therefore every `finalize`) hangs indefinitely. Because the gates are concurrent, one hung gate consumes capacity for every concurrent invocation too, which matters given AGENTS.md already documents this host OOMing under two parallel bun-test processes.

There is no kill path: the parent cannot cancel, so the only recovery is killing the process tree by hand.


Evidence: scripts/check-parallel.mjs:697-738 (spawn at L703, unbounded await at L708, durationMs at L723)

## Acceptance Criteria

- [ ] Every gate has a bounded timeout; the child is killed on expiry
- [ ] A timed-out gate is reported as failed with a message naming the gate and the budget
- [ ] The budget is configurable per gate, with a sane default, and documented in the runner header
- [ ] An existing test drives a gate fixture that sleeps past the timeout and asserts the kill path
