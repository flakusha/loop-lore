# TASK: feat(check): --gates/--skip-gates filter on parallel runner

**Status:** ✅ Finished (2026-09-10)
git issue: ccf8edf24
**Priority:** medium
**Tags:** ["check", "cli", "worktree"]

## Summary

New CLI flags for `check-parallel.mjs` to filter which gates run — `--gates <csv>` (whitelist) and `--skip-gates <csv>` (inverse filter). Flags are forwarded into `worktree finalize` Step 2 so worktrees can scope their scope-check to a fast subset of the 21 gates.

## Implementation

- `scripts/check-parallel.mjs` — `--gates` / `--skip-gates` parsing, validation against checks dict at startup, mutual-exclusion logic
- `scripts/worktree/commands/finalize.ts` — accepts same flags and forwards to Step 2 `bun run check --diff-base <ref>`
- `scripts/check-parallel.gates.test.mjs` — 5 tests: whitelist, inverse, multi-name, unknown-name error, mutual exclusion
- `scripts/worktree/commands/finalize-args.test.ts` — arg forwarding tests
- `AGENTS.md` — verification-gates section updated; finalize help text updated

## Commits

- `ccf8edf24` feat(check): --gates/--skip-gates filter on parallel runner
- `2b0b6a562` feat(rpg): per-mechanic opt-in, command gating, flags *(finalize.ts threading part)*

## Acceptance Criteria

- [x] `--gates typecheck,lint` runs only typecheck + lint gates
- [x] `--skip-gates coverage` runs all gates except coverage
- [x] Unknown gate name exits 2 with available-gates list
- [x] Flags are mutually exclusive
- [x] Flags forwarded to worktree finalize Step 2
- [x] Tests passing

## Resolution

Landed on dev `2026-09-10`. All 5 gate-filter tests pass; `bun run check` green (21/21).
