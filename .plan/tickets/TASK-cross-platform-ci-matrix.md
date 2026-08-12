# TASK: Cross-Platform CI Matrix (Windows + macOS)

**Status:** 🟡 Open
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** cross-platform, ci, windows, macos, github-actions
**Epic:** epic-cross-platform-portability.md

## Description

Portability regressions are invisible without OS coverage. CI currently (per `epic-cicd-pipeline.md`) targets Linux only. Add Windows + macOS runners so `bun test` + `bun run check` run on every OS.

## Fix

- Add Windows + macOS runner jobs to the CI workflow executing `bun test` and `bun run check`.
- Ensure setup steps are OS-portable (Bun install via official action; git/OpenSSL available).
- Surface failures as required checks.

## Acceptance Criteria

- [ ] CI has Windows + macOS jobs running `bun test` + `bun run check`
- [ ] A deliberate Linux-only regression fails the Windows/macOS job
- [ ] Linux job unchanged

## Files

- CI workflow (`.github/workflows/*` or repo CI config)
- `epic-cicd-pipeline.md` (cross-reference)
