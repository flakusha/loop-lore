<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement reusable bulk ticket-resolution helper

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

see attached description

## Goal

Provide a permanent, reusable CLI for bulk-updating `.plan/tickets/*.md` Status lines + injecting `## Resolution` evidence blocks. Replaces the ad-hoc `.tmp/resolve-bucket-{b,c,d}.mjs` pattern used in 3 recent sessions.

## Acceptance criteria (script behavior)

- [ ] `scripts/plan/resolve-tickets.mjs` implements:
  - `--ticket <path>` (repeatable); `--status <text>`; `--old-status <pattern>`; `--resolution <file>` or `--resolution-stdin`; `--marker <heading>`; `--dry-run` (default true); `--apply`
  - Idempotent: skip if resolution block present; error on missing old Status
- [ ] Exit codes: 0 success, 1 missing-file / missing-status, 2 invalid args
- [ ] `bun run plan:resolve-tickets --help` works
- [ ] Smoke test under `scripts/plan/resolve-tickets.test.mjs` (happy path, idempotency, error)
- [ ] AGENTS.md updated with usage example
- [ ] Migration note: deprecate `.tmp/resolve-bucket-*.mjs` pattern in favor of this CLI

## Design notes

- Pure Node `fs.readFileSync/writeFileSync`; matches `scripts/worktree/`, `scripts/check-parallel.mjs`
- TypeScript preferred (matches `scripts/worktree/`); JS acceptable
- No new dependency; reuse `node:fs`, `node:path`
- Args via `node:util.parseArgs`

## Files to reference

- `scripts/worktree/commands/ticket.ts` (existing ticket CLI pattern)
- `scripts/worktree/index.mjs` (entry-point convention)
- `scripts/check-parallel.mjs` (parseArgs-like patterns)

## Related work

- Replaces ad-hoc `.tmp/resolve-bucket-{b,c,d}.mjs` (deleted per AGENTS.md scratchpad rules)
- Bucket B / C / D sessions (2026-09-02 to 2026-09-03, engram) used the ad-hoc pattern 3 times — clearly recurring

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


git issue: df8fd5f
