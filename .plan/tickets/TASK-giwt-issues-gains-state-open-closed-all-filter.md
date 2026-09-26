<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: giwt issues gains --state open|closed|all filter

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small

**Summary:** <!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# giwt issues gains --state open|closed|all filter

**Status:** open
**Priority:** low
**Effort:** Small
**Type:** Task

## Summary

`giwt issues` currently accepts only `--all/-a` and `--format/-f`. It does
NOT forward `--state` to `git issue ls`, and worse: it silently swallows
unknown flags. `git issue ls --help` exposes `--state <open|closed|all>`
already, so the fix is a one-line passthrough plus a manual consumer
migration (`find-work`).

## Repro / Current state

- `giwt/issues.ts` (2026-09-26) handles only `--all|-a` and `--format|-f`
  (`giwt/src/commands/issues.ts:9-25`). The `for (let i = 0; i < args.length; i++)`
  switch has no `default` branch, so unrecognized flags (including
  `--state=open`) are dropped without error and consume zero args.
- The slice for the non-`--all` path is hard-coded
  `Math.min(lines.length, 50)` (`giwt/src/commands/issues.ts:36-37`), and
  the non-filtered call is `git issue ls --format <format>`
  (`giwt/src/commands/issues.ts:28`).
- `git issue ls --help` (verified 2026-09-26) supports
  `-s, --state <state>` accepting `open|closed|all` (default `open`).

### Confirmed silent-ignore behavior

```
$ giwt issues --state=closed | wc -l
# shows "issues (50):" followed by 50 open issues
$ giwt issues --state=closed | grep -c '^[^ ]* closed'
# 0 - all lines are "open", not "closed"
```

The user thinks they filtered to closed; they got the default `open`
listing because the flag was silently dropped by the switch. This is a
real correctness bug, not just a UX gap.
**Context:** Filed via giwt template lacking required bold sections; normalized 2026-09-26 during the mock-isolation migration finalize.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification executed green
