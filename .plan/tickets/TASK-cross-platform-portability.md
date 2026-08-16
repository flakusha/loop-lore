<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Cross-Platform Portability — Windows & macOS (run from repo + single binary)

**Status:** 🟡 Open
**Priority:** High
**Effort:** Large
**Type:** Task
**Tags:** cross-platform, windows, macos, portability, build
**Epic:** epic-cross-platform-portability.md

## Description

Make loop-lore usable on Windows and macOS from two angles:

1. **As-repository (highest priority)** — `bun run dev` / `bun test` / `bun run check`
   work on Windows and macOS with no Linux-only assumptions.
2. **As built app** — produce a standalone executable via `bun build --compile`
   (or `deno compile`) so end users don't need a toolchain.

Umbrella task for `epic-cross-platform-portability.md`. Related work: native
binary distribution (`epic-precompiled-hot-binaries.md`), Deno compile
(`epic-deno-support.md`), CI matrix (`epic-cicd-pipeline.md`).

## Audit Findings (evidence)

**Already portable (no change needed):**

- `src/services/external-server-utils.ts:20-24` — appends `.exe` on `win32` for
  external binary discovery.
- `src/services/server-external-manager/lifecycle.ts:9-19,43-50` — guards
  `process.kill` signal strings on `win32`.
- `src/config/cert.ts:44-78` — selects `openssl.exe` on `win32` + platform hint.
- `bun:sqlite` is prebuilt for Windows/macOS/Linux by Bun — DB layer portable.
- Most code uses `node:os` (`homedir()`, `tmpdir()`) + `node:path` (`join`,
  `resolve`) — e.g. `src/services/server-external-manager/start-llama.ts:23-25`,
  `start-sd.ts:13-15`.

**Blockers identified:**

1. `src/server/start.ts:191-193` — `process.on("SIGHUP", …)` registered
   unconditionally. **SIGHUP is unsupported on Windows; registering a handler
   throws at boot → server crashes on Windows.** `SIGTERM`/`SIGINT` are fine.
   → **FIX APPLIED** (`start.ts:191-197`, guarded by `process.platform !== "win32"`).
2. `src/assets/service/file-system.ts:23-28` — path-traversal guard hardcodes
   `/home` + `/` separators (Linux-only). Windows paths use `\` and different
   roots; the guard misbehaves (security-sensitive — needs OS-aware checks).
3. `scripts/worktree.sh`, `scripts/lib/assertions.sh`, `scripts/lib/colors.sh`,
   `scripts/load-credentials.sh` — bash. `package.json` scripts themselves are
   `bun run …` (portable). Devs on Windows need Git Bash / WSL for worktree +
   ticket commands, OR those commands must be ported to TS (partial port exists
   in `scripts/worktree/index.mjs`).
4. `scripts/commit-check.ts:134`, `scripts/version-bump.ts:56` — `execSync("git …")`
   shell-string invocation (relies on `sh`; works on Windows only if git is on
   PATH and no bashisms used).
5. Tests/smoke use `/tmp` (`src/content/compress.test.ts:9`,
   `scripts/smoke-app.ts:18`) — test-only; acceptable but not portable-style.

## Tier 1 — As-Repository Portability (highest priority)

- [x] **T1.1** Guard `SIGHUP` in `src/server/start.ts` (FIX APPLIED, uncommitted —
      verify + commit).
- [ ] **T1.2** Make `src/assets/service/file-system.ts` path guard OS-aware
      (use `node:path` `sep`/`isAbsolute`; Windows root + profile-dir checks).
      Security-sensitive — add a test per platform path shape.
- [ ] **T1.3** Port remaining `worktree.sh` core commands (ticket, issues, commit,
      finalize, sync) to TS under `scripts/worktree/`, or document Git Bash/WSL as a
      Windows dev prerequisite in `docs/guide/getting-started.md`.
- [ ] **T1.4** Replace `execSync("git …")` shell strings in `scripts/` with
      portable `Bun.$` / `spawn` arg-arrays (no shell interpolation).
- [ ] **T1.5** Confirm no runtime `/tmp` or hardcoded unix paths remain
      (runtime already uses `os.tmpdir()`; audit clean except tests).
- [ ] **T1.6** Add a CI matrix (Windows + macOS runners) executing
      `bun test` + `bun run check` (ties `epic-cicd-pipeline.md`) so portability
      regressions are caught continuously.
- [ ] **T1.7** Document Windows/macOS dev setup in `docs/guide/getting-started.md`
      (Bun/Node install, OpenSSL on PATH, git on PATH, WSL/Git Bash for bash scripts).

## Tier 2 — As Built App (single binary)

- [ ] **T2.1** Spike `bun build --compile --target=bun src/server/index.ts` →
      standalone executable on each OS. Verify config/db path resolution under the
      compiled context (`import.meta.dir`, `process.cwd()`, env overrides).
- [ ] **T2.2** Static-asset strategy for the compiled binary: `bun build --compile`
      does NOT auto-embed arbitrary files. Switch `src/server/static-files.ts` (or
      the `dist/public` loader) to `Bun.embed`/embedded assets, or document an
      external `public/` directory shipped alongside the binary.
- [ ] **T2.3** Evaluate `deno compile` as alternative (ties `epic-deno-support.md`);
      note `import.meta.dir`/`Bun.*` API differences.
- [ ] **T2.4** Ensure native hot-binary modules ship Windows `.dll` / macOS
      `.dylib` (ties `epic-precompiled-hot-binaries.md`) so a compiled app keeps
      native crypto/compression speed.

## Acceptance Criteria (overall)

- [ ] `bun run dev` boots on Windows + macOS without throwing (no unsupported
      signal / path / shell assumptions at startup).
- [ ] `bun test` + `bun run check` green on Windows + macOS CI runners.
- [ ] A `bun build --compile` artifact runs on each OS with assets + DB working.
- [ ] Windows/macOS dev prerequisites documented; no undocumented bash-only steps
      block first-run.

## Files

- `src/server/start.ts` — signal guard (T1.1, done)
- `src/assets/service/file-system.ts` — OS-aware path guard (T1.2)
- `scripts/worktree.sh` + `scripts/worktree/` — TS port / prereq doc (T1.3)
- `scripts/commit-check.ts`, `scripts/version-bump.ts` — portable git exec (T1.4)
- `docs/guide/getting-started.md` — Windows/macOS setup (T1.7)
- `src/server/static-files.ts` — embedded/external asset strategy (T2.2)
- CI workflow — Windows/macOS matrix (T1.6)

## Linked Epics / Tasks

- `epic-cross-platform-portability.md` (parent epic)
- `TASK-cross-platform-filesystem-path-guard.md` (T1.2)
- `TASK-cross-platform-dev-tooling-port.md` (T1.3 + T1.4 + T1.7)
- `TASK-cross-platform-ci-matrix.md` (T1.6)
- `TASK-cross-platform-single-binary.md` (T2.1 + T2.2)
- `epic-cicd-pipeline.md` (CI matrix, T1.6)
- `epic-precompiled-hot-binaries.md` (native binaries, T2.4)
- `epic-deno-support.md` (Deno compile alternative, T2.3)
