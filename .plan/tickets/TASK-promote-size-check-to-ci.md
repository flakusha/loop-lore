# TASK: Promote `check-file-size.ts` from Warn to CI Gate

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-code-quality

## Summary

Promote `scripts/check-file-size.ts` from a non-blocking nudge to a CI gate. Added `--strict` mode that exits non-zero for oversized files. Wired into `check-parallel.sh` as both non-blocking and strict gates.

## Current State

- `scripts/check-file-size.ts` updated with `--strict` flag and `--limit N` override
- `scripts/check-parallel.sh` updated with `size-check` (non-blocking) and `size-strict` (CI gate) entries
- Default mode still warns and exits 0 (non-blocking)
- `--strict` mode exits 1 for any file over the limit

## Changes Made

1. ✅ Added `--strict` flag to `check-file-size.ts` (exit 1 for oversized files)
2. ✅ Added `--limit N` flag to override the 250L threshold
3. ✅ Added `size-check` (non-blocking) and `size-strict` (CI gate) to `check-parallel.sh`

## Remaining Work

- [ ] Wire `size-strict` into `bun run check` pipeline (add to `check:parallel` or `check:serial`)
- [ ] Optionally lower the soft limit from 250L to 200L to match AGENTS.md convention
- [ ] Existing god files (messages.ts, generate-route.ts, schema.ts, server.ts) are either split or have documented exceptions

## Files

- `scripts/check-file-size.ts` — added `--strict` and `--limit` flags
- `scripts/check-parallel.sh` — added `size-check` and `size-strict` gates
