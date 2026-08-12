# TASK: Cross-Platform Dev Tooling Port (Windows/macOS)

**Status:** 🟡 Open
**Priority:** Medium
**Effort:** Medium
**Type:** Task
**Tags:** cross-platform, windows, macos, tooling, scripts, worktree
**Epic:** epic-cross-platform-portability.md

## Description

Several dev workflows require bash (`scripts/worktree.sh`, `scripts/lib/*.sh`, `scripts/load-credentials.sh`). Windows devs must use Git Bash / WSL. Separately, `scripts/commit-check.ts:134` and `scripts/version-bump.ts:56` use `execSync("git …")` shell strings.

## Fix

- Port remaining `worktree.sh` core commands (ticket, issues, comment, state, search, attach, commit, finalize, sync) to TS under `scripts/worktree/` (a partial port already exists in `scripts/worktree/index.mjs`).
- Replace `execSync("git …")` in `scripts/` with portable `Bun.$` or `spawn` arg-arrays (no shell interpolation).
- Document Windows/macOS dev prerequisites in `docs/guide/getting-started.md` (Bun/Node, OpenSSL on PATH, git on PATH, WSL/Git Bash for any remaining bash step).

## Acceptance Criteria

- [ ] `worktree` commands usable without a POSIX shell (TS entry point)
- [ ] No `execSync` shell-string git invocations remain in `scripts/`
- [ ] `docs/guide/getting-started.md` documents Windows/macOS first-run steps
- [ ] `bun run check` still green on Linux

## Files

- `scripts/worktree.sh`, `scripts/worktree/` (port)
- `scripts/commit-check.ts`, `scripts/version-bump.ts` (portable git)
- `docs/guide/getting-started.md` (docs)
