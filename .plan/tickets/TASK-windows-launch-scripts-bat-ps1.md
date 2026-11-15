<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Windows launch scripts (.bat/.ps1)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-cross-platform-portability
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Ship `start.bat` + `start.ps1` at repo root: resolve deps (`bun install` when `node_modules` is missing), pick a mode (`server` / `tui`), control `NODE_ENV` explicitly, run `bun run start` / `bun run tui`, and surface an actionable port-conflict hint when the bind fails. Under epic-cross-platform-portability. Gap G6.

**Context:**

Verified 2026-11-15 against the worktree at `tree/research-tickets-promotion`:

- There is NO committed Windows launcher. `git ls-files | grep -iE '\.(bat|ps1)$'` returns nothing — the repo ships zero `.bat`/`.ps1` files. `.gitignore` has no `*.bat`/`*.ps1` entries, so nothing blocks adding them; the only Windows-shaped ignore rule is `config.*.sh` (`.gitignore:45`), which is the POSIX-only reservation the gap audit calls out.
- `docs/guide/installation.md:18-30` is the only Windows guidance: a prose PowerShell block (`git clone` / `bun install` / `bun run db:migrate` / `bun run dev`) plus the note "TUI requires Windows Terminal or WSL. PowerShell/CMD unsupported." No committed launcher means the Windows path is a copy-paste ritual with no dependency check, no `NODE_ENV` policy, and no failure hint.
- The scripts a launcher must drive already exist (`package.json`): `"start": "bun run src/server/index.ts"`, `"tui": "bun run src/tui/app.ts"`, `"dev": "bun run build:frontend && bun run --watch src/server/index.ts"`. A launcher therefore adds no new runtime surface — it only wires the existing entry points.
- `node_modules` is gitignored (`.gitignore:8`), so a fresh clone has no dependencies installed and `bun run start` fails on missing imports. `bun.lock` (349 KB) is committed, so `bun install --frozen-lockfile` is the deterministic recovery.
- Migrations run at boot: `src/server/start.ts:208-209` calls `runMigrations` + `runDataMigrations` before the listener starts, so the launcher does NOT need a separate `bun run db:migrate` step (the `installation.md` Windows block does list it; that step is redundant on a start path and may stay documented for other flows).
- Default port is 3000 (`packages/core/src/config/sections/server.ts:13`, `SERVER_DEFAULTS.port`) and is overridable by the `PORT` env var (`packages/core/src/config/schema-class/env-map.ts:109`, `map.PORT = "server.port"`).
- A port conflict is currently a bare crash: the only boot-failure handler is `src/server/index.ts:12-16`, which prints `[server] startup failed: <err>` and exits 1 for ANY error. The dedicated friendly-message ticket (`TASK-friendly-port-conflict-error-on-boot-eaddrinuse`) is `Not Started` / priority `low`, so a launcher CANNOT rely on a friendly server-side message — the launcher must add its own hint.
- The TUI is a client of a running server, not a server: `src/tui/chat/api.ts:11` hardcodes `API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000"`. A TUI-mode launcher must therefore surface the base URL it expects and set `LOOP_LORE_API_BASE_URL` when the operator moved the port, otherwise the TUI silently talks to the wrong port.
- `NODE_ENV` is load-bearing and its meaning is non-obvious. `packages/core/src/config/load/pii-safety.ts:19-22` (`isDevEnv`) treats UNSET as production-like: only `test`/`development`/`dev` count as dev. Consequences:
  - `NODE_ENV=production` makes the auth cookie `Secure` (`src/routes/auth/shared.ts:91-95`) and the CSRF cookie `Secure` (`src/middleware/csrf.ts:344`, `opts.cookieSecureInProd ?? process.env["NODE_ENV"] === "production"`). A browser DROPS a `Secure` cookie over plain `http://localhost:3000`, so a launcher that forces `production` on a plain-HTTP local start breaks login. `LL_COOKIE_SECURE=false` is the documented escape hatch.
  - `NODE_ENV=development` makes the PII secret fall back to a hardcoded dev value (`pii-safety.ts:11`, `NSFW_PII_DEV_FALLBACK`, used at `:58`) and SKIPS first-boot promotion (`packages/core/src/config/load/first-boot.ts:173-174`, `if (isDevEnv()) { return config; }`) — so no `config.local.yaml` is written (`first-boot.ts:42`) and PII-derived audit hashes drift across restarts.
  - `NODE_ENV` unset keeps today's shipped behavior: PII secrets are required or promoted on first boot, and cookies stay non-`Secure` because the check is `=== "production"`, not "prod-like".
  - Telemetry is auto-enabled whenever `NODE_ENV !== "production"` (`src/telemetry/config.ts:19`), so a `development` launcher also turns local telemetry on.
- TLS is out of the local-HTTP path but must not be silently broken: certificate provisioning resolves `openssl.exe` on Windows (`packages/core/src/config/cert.ts:50-51`) and `installation.md:30` already warns that OpenSSL must be on PATH for the TLS auto-gen features.

Constraints:

- One script pair, two modes, no new dependency and no new runtime entry point. The scripts call the EXISTING `bun run start` / `bun run tui` scripts — they must not re-implement boot, migration, config loading, or secret handling.
- `NODE_ENV` policy is explicit and documented in the script header, not accidental: never force `production` for a plain-HTTP local start, and never force `development` without stating its two consequences (no first-boot promotion → dev fallback PII secret; telemetry auto-enabled). An operator-supplied `NODE_ENV` is honored, never clobbered.
- The port-conflict hint is the launcher's own, because the server-side friendly message is a separate, unshipped ticket. It names the effective port and the `PORT` override; it does NOT retry the bind and does NOT auto-pick another port.
- The TUI mode states the base URL it will talk to and passes `LOOP_LORE_API_BASE_URL` through when the port was overridden.
- `bun install` runs ONLY when `node_modules` is absent, and uses `--frozen-lockfile` so the committed `bun.lock` is honoured.
- Scripts are plain `cmd`/PowerShell: no bash, no WSL/Git-Bash dependency, no `chmod`, no POSIX paths. The TUI mode notes that it needs a real terminal (Windows Terminal) per `installation.md:20`.
- `scripts/check-no-shell-refs.ts` scans `AGENTS.md`, `.agents/` and `scripts/` for `.sh` mentions — the new root scripts must not introduce `.sh` references into those paths.

Alternatives considered:

- A single `bun run` cross-platform launcher script (TypeScript) instead of `.bat`/`.ps1` — rejected for THIS ticket: the gap is specifically "a Windows operator double-clicks or runs a launcher", and the epic's Phase-2 single-binary work (`T2.1`) is the place a compiled entry point belongs. A TS launcher would still require `bun` on PATH and a working install before it can run, which is exactly what the `.bat`/`.ps1` pair bootstraps.
- A `.bat` that simply wraps `powershell -File start.ps1` (single implementation, thin `.bat` shim) — acceptable as long as only ONE script holds the logic; the `.bat` must not become a second, drifting copy of the policy.
- Shipping only `.ps1` — rejected: `cmd.exe` is still the default shell on many Windows installs and the epic's portability goal is "works without a POSIX shell".

**Acceptance Criteria:**

- [ ] `start.bat` and `start.ps1` exist at repo root and are tracked by git (they are not covered by any `.gitignore` rule)
- [ ] each script has exactly ONE mode-selection surface: default `server` (`bun run start`) and a `tui` mode (`bun run tui`); the mode is documented in the script header
- [ ] when `node_modules` is missing, the script runs `bun install --frozen-lockfile` before the target command; when it exists, no install runs
- [ ] `NODE_ENV` handling is explicit and documented in the script header: an operator-set `NODE_ENV` is honored unchanged; the launcher never forces `NODE_ENV=production` for a plain-HTTP local start (plain HTTP + `production` makes the auth/CSRF cookie `Secure` and breaks login — `src/routes/auth/shared.ts:91-95`, `src/middleware/csrf.ts:344`); any value the launcher does set states the first-boot-promotion and telemetry consequences
- [ ] a port conflict produces an actionable message naming the effective port (default 3000, `packages/core/src/config/sections/server.ts:13`) and the `PORT` override (`packages/core/src/config/schema-class/env-map.ts:109`); the launcher does not retry the bind and does not pick another port
- [ ] the port-conflict hint works while the server-side friendly message (`TASK-friendly-port-conflict-error-on-boot-eaddrinuse`) is still `Not Started` — the hint is produced by the launcher, not by the server
- [ ] the TUI mode prints the base URL it will use and exports `LOOP_LORE_API_BASE_URL` when the port was overridden, matching `src/tui/chat/api.ts:11` (`LOOP_LORE_API_BASE_URL ?? "http://localhost:3000"`)
- [ ] the TUI mode states that a real terminal (Windows Terminal) is required, per `docs/guide/installation.md:20`
- [ ] neither script relies on bash/WSL/Git Bash, POSIX paths, `chmod`, or a POSIX-only tool
- [ ] the scripts are documented in `docs/guide/installation.md` (Windows section) and referenced from `docs/guide/getting-started.md`
- [ ] a smoke check exists that proves the scripts parse and dispatch correctly (e.g. a dry-run/print-path mode, or a test that invokes the script with a stub `bun` on PATH) — the launcher logic is not left untested
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
