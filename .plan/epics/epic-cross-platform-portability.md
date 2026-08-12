# EPIC: Cross-Platform Portability — Windows & macOS

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Type:** Infrastructure Epic
**Tags:** cross-platform, windows, macos, portability, build, runtime

## Summary

Make loop-lore run on Windows and macOS from two angles:

1. **As-repository (highest priority)** — `bun run dev` / `bun test` / `bun run check` work on Windows and macOS with no Linux-only assumptions.
2. **As built app** — produce a standalone executable via `bun build --compile` (or `deno compile`) so end users don't need a toolchain.

loop-lore is developed and CI-tested on Linux. This epic removes the Linux-only assumptions so the project is portable.

## Scope

- Audit + eliminate Linux-only runtime assumptions (signals, paths, shell, perms).
- Make dev tooling (scripts, worktree/ticket commands) run without a POSIX shell.
- Add a Windows + macOS CI matrix to keep portability regression-free.
- Verify single-binary compilation and asset/config path resolution.

## Current State Assessment

**Already portable (no change):**

- `src/services/external-server-utils.ts` — appends `.exe` on `win32`.
- `src/services/server-external-manager/lifecycle.ts` — guards kill signals on `win32`.
- `src/config/cert.ts` — selects `openssl.exe` on `win32`.
- `bun:sqlite` is prebuilt for Windows/macOS/Linux by Bun.
- Most code uses `node:os` (`homedir()`, `tmpdir()`) + `node:path` (`join`, `resolve`).

**Blockers (evidence):**

- `src/server/start.ts:191-193` — `SIGHUP` registered unconditionally → throws at boot on Windows. **FIX APPLIED** (`start.ts:191-197`, guarded by `process.platform !== "win32"`; uncommitted).
- `src/assets/service/file-system.ts:23-28` — path guard hardcodes `/home` + `/` (Linux-only).
- `scripts/worktree.sh`, `scripts/lib/*.sh`, `scripts/load-credentials.sh` — bash; Windows needs Git Bash/WSL.
- `scripts/commit-check.ts:134`, `scripts/version-bump.ts:56` — `execSync("git …")` shell strings.

## Implementation Phases

### Phase 1 — As-Repository Portability (highest priority)

- [ ] T1.1 Guard `SIGHUP` in `src/server/start.ts` (DONE — fix applied, uncommitted; verify + commit)
- [ ] T1.2 Make `src/assets/service/file-system.ts` path guard OS-aware (`node:path` `sep`/`isAbsolute`; add per-platform test)
- [ ] T1.3 Port `worktree.sh` core commands (ticket, issues, commit, finalize, sync) to TS under `scripts/worktree/`
- [ ] T1.4 Replace `execSync("git …")` shell strings in `scripts/` with portable `Bun.$` / arg-array `spawn`
- [ ] T1.5 Confirm no runtime `/tmp` or hardcoded unix paths remain
- [ ] T1.6 Add Windows + macOS CI matrix (`bun test` + `bun run check`)
- [ ] T1.7 Document Windows/macOS dev setup in `docs/guide/getting-started.md`

### Phase 2 — As Built App (single binary)

- [ ] T2.1 Spike `bun build --compile` → standalone executable; verify config/db path resolution
- [ ] T2.2 Static-asset strategy for compiled binary (`Bun.embed` or external `public/` dir)
- [ ] T2.3 Evaluate `deno compile` alternative (see `epic-deno-support.md`)
- [ ] T2.4 Ship native hot-binary modules for Windows/macOS (see `epic-precompiled-hot-binaries.md`)

## Files (proposed)

- `src/server/start.ts` — signal guard (T1.1, done)
- `src/assets/service/file-system.ts` — OS-aware path guard (T1.2)
- `scripts/worktree.sh` + `scripts/worktree/` — TS port (T1.3)
- `scripts/commit-check.ts`, `scripts/version-bump.ts` — portable git exec (T1.4)
- `docs/guide/getting-started.md` — Windows/macOS setup (T1.7)
- `src/server/static-files.ts` — embedded/external asset strategy (T2.2)
- CI workflow — Windows/macOS matrix (T1.6)

## Testing Strategy

| Test | Coverage | Files |
| ---- | -------- | ----- |
| Unit | OS-aware path guard parity (win/mac/linux path shapes) | `src/assets/service/file-system.test.ts` |
| CI | `bun test` + `bun run check` green on Windows + macOS runners | CI workflow |
| Build | `bun build --compile` artifact boots + serves assets on each OS | `tests/e2e/` |

## Linked Tasks

- `TASK-cross-platform-portability.md` (umbrella)
- `TASK-cross-platform-filesystem-path-guard.md` (T1.2)
- `TASK-cross-platform-dev-tooling-port.md` (T1.3 + T1.4 + T1.7)
- `TASK-cross-platform-ci-matrix.md` (T1.6)
- `TASK-cross-platform-single-binary.md` (T2.1 + T2.2)

## Related Epics

- `epic-deno-support.md` — Deno/Node runtime abstraction + `deno compile` (T2.3)
- `epic-precompiled-hot-binaries.md` — native Windows `.dll` / macOS `.dylib` modules (T2.4)
- `epic-cicd-pipeline.md` — CI pipeline + Windows/macOS runners (T1.6)
