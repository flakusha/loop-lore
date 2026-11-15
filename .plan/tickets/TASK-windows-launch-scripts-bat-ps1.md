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
- `node_modules` is gitignored (`.gitignore:8`), so a fresh clone has no dependencies installed and `bun run start` fails on missing imports. `bun.lock` (349 KB) is committed, so `bun install --frozen-lockfile` is the deterministic recovery — the flag exists in this Bun (`bun install --help` → `--frozen-lockfile  Disallow changes to lockfile`). The repo is a workspace root (`package.json` → `"workspaces": ["packages/*"]`), so a root `bun install` also installs the workspace packages; a root `node_modules` check is the correct "are deps installed" gate.
- Migrations run at boot: `src/server/start.ts:208-209` calls `runMigrations` + `runDataMigrations` before the listener starts, so the launcher does NOT need a separate `bun run db:migrate` step (the `installation.md` Windows block does list it; that step is redundant on a start path and may stay documented for other flows).
- The launcher must NOT add a frontend build step. `bun run start` does not build assets itself, but the boot path does: `src/server/start.ts:342` calls `initAssetCompression`, which auto-runs `bun run build:frontend` when `dist/public/app.js` is missing (`src/server/init-asset-compression.ts:26-37`) and copies `src/public` + `src/views` into `dist/public` (`init-asset-compression.ts:39-41`). A launcher that pre-builds the frontend would duplicate work the server already does.
- Default port is 3000 (`packages/core/src/config/sections/server.ts:13`, `SERVER_DEFAULTS.port`) and is overridable by the `PORT` env var (`packages/core/src/config/schema-class/env-map.ts:109`, `map.PORT = "server.port"`; `packages/core/src/config/load/env.ts:18` reads `process.env[environmentVariable]`).
- The port-conflict hint CANNOT come from the server process, because the launcher starts the server as a CHILD. The child's failure path is `src/server/index.ts:12-16`: it prints `[server] startup failed: ${String(error)}` to stderr and exits 1 for ANY error. The dedicated friendly-message ticket (`TASK-friendly-port-conflict-error-on-boot-eaddrinuse`) is `Not Started` / priority `low`, so the server-side message is unshipped.
- What the child actually prints on a port conflict was MEASURED (probe against this Bun): `Bun.serve` on a taken port throws `Error: Failed to start server. Is port 45999 in use?` with `code = "EADDRINUSE"`, `syscall = "listen"`, so the child's stderr line is `[server] startup failed: Error: Failed to start server. Is port 3000 in use?`. Two consequences: (a) the port IS named today, but the message never says HOW to change it; (b) matching on that text couples the launcher to a Bun-version-specific string. The launcher's hint must therefore be produced by a PRE-FLIGHT port check, leaving the child's own message as-is.
- The TUI is a client of a running server, not a server: `src/tui/chat/api.ts:11` hardcodes `API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000"`. A TUI-mode launcher must therefore surface the base URL it expects and set `LOOP_LORE_API_BASE_URL` when the operator moved the port, otherwise the TUI silently talks to the wrong port. The TUI also honours a kill switch: `config.tui.enabled` (default `true`, `packages/core/src/config/sections/tui.ts:7`, env var `ENABLE_TUI` → `tui.enabled`, `env-map.ts:122`); when disabled, `src/tui/app.ts:150-153` prints `TUI_DISABLED_STATUS` and exits 0 — so a zero exit from TUI mode does not prove a working client.
- `NODE_ENV` is load-bearing and its meaning is non-obvious. `packages/core/src/config/load/pii-safety.ts:19-22` (`isDevEnv`) treats UNSET as production-like: only `test`/`development`/`dev` count as dev. Consequences:
  - `NODE_ENV=production` makes the auth cookie `Secure` (`src/routes/auth/shared.ts:91-95`) and the CSRF cookie `Secure` (`src/middleware/csrf.ts:344`, `opts.cookieSecureInProd ?? process.env["NODE_ENV"] === "production"`). A browser DROPS a `Secure` cookie over plain `http://localhost:3000`, so a launcher that forces `production` on a plain-HTTP local start breaks login. `LL_COOKIE_SECURE=false` is the documented escape hatch.
  - `NODE_ENV=development` makes the PII secret fall back to a hardcoded dev value (`pii-safety.ts:11`, `NSFW_PII_DEV_FALLBACK`, used at `:58`) and SKIPS first-boot promotion (`packages/core/src/config/load/first-boot.ts:173-174`, `if (isDevEnv()) { return config; }`) — so no `config.local.yaml` is written (`first-boot.ts:42`) and PII-derived audit hashes drift across restarts.
  - `NODE_ENV` unset keeps today's shipped behavior: PII secrets are required or promoted on first boot, and cookies stay non-`Secure` because the check is `=== "production"`, not "prod-like".
  - Telemetry is auto-enabled whenever `NODE_ENV !== "production"` (`src/telemetry/config.ts:19`), so a `development` launcher also turns local telemetry on.
- TLS is out of the local-HTTP path but must not be silently broken: certificate provisioning resolves `openssl.exe` on Windows (`packages/core/src/config/cert.ts:50-51`) and `installation.md:30` already warns that OpenSSL must be on PATH for the TLS auto-gen features.
- Windows shell mechanics the launcher must respect:
  - The repo has NO `.gitattributes` (`git ls-files | grep -i gitattributes` → nothing), so a `.bat` committed with LF-only line endings risks `cmd.exe` failing on labels/`goto` ("cannot find the batch label"). Either the `.bat` is committed with CRLF (a `.gitattributes` entry `*.bat text eol=crlf`) or it avoids label/multi-line-block constructs entirely.
  - `cmd.exe` has no `set -e` and no process substitution; PowerShell 5.1 (`powershell.exe`) ships with Windows but PowerShell 7 (`pwsh`) does NOT, so a launcher that shells out to `pwsh` is not portable by default.
  - `cmd.exe` may raise "Terminate batch job?" on Ctrl+C; the launcher must not swallow the child's exit code.
- The licence/format gates do not cover the new file types as-is: `scripts/check-spdx.ts` only checks `.ts/.tsx/.js/.mjs/.html/.css/.md/.mdx` (`scripts/lib/spdx-discovery.ts:11-19`), so `.bat`/`.ps1` need no SPDX header to pass that script — but `REUSE.toml`'s root aggregate annotation lists `*.ts, *.js, *.mjs, *.json, *.toml` and NOT `*.bat`/`*.ps1`, so the new files would be uncovered by the repo's licence registry. `dprint` only formats the extensions its plugins declare (ts/json/markdown/markup/yaml/toml/sh), so the new files sit outside the formatter too — no formatting rule to satisfy, but also no automatic help.

Constraints:

- One script pair, two modes, no new dependency and no new runtime entry point. The scripts call the EXISTING `bun run start` / `bun run tui` scripts — they must not re-implement boot, migration, config loading, or secret handling.
- ONE script holds the logic; the other is a thin forwarder. `start.bat` forwarding to `start.ps1` is the expected shape (`powershell -File start.ps1`), so the install check, `NODE_ENV` policy, port pre-flight and mode dispatch exist in exactly one place. The `.bat` must not become a second, drifting copy of the policy, and the forwarding must work under the DEFAULT Windows execution policy (the operator must not have to edit machine policy to run it).
- `NODE_ENV` policy is explicit and documented in the script header, not accidental: never force `production` for a plain-HTTP local start, and never force `development` without stating its two consequences (no first-boot promotion → dev fallback PII secret; telemetry auto-enabled). An operator-supplied `NODE_ENV` is honored, never clobbered.
- The port-conflict hint is the launcher's own, produced by a PRE-FLIGHT check of the effective port BEFORE the server starts, because the launcher's server runs as a child whose failure text is Bun-version-specific and the server-side friendly message is a separate, unshipped ticket. It names the effective port and the `PORT` override; it does NOT retry the bind and does NOT auto-pick another port.
- The TUI mode states the base URL it will talk to and passes `LOOP_LORE_API_BASE_URL` through when the port was overridden.
- `bun install` runs ONLY when `node_modules` is absent, and uses `--frozen-lockfile` so the committed `bun.lock` is honoured. A failed install aborts the launch instead of continuing into a broken start.
- Scripts are plain `cmd`/PowerShell: no bash, no WSL/Git-Bash dependency, no `chmod`, no POSIX paths, no `pwsh`-only syntax. The TUI mode notes that it needs a ConPTY-capable terminal — Windows Terminal (per `installation.md:20`); `docs/spec/terminal-ui.md:27` records that pi-tui handles ConPTY on Windows. The older "blessed has no mouse/resize on Windows" caveat in `docs/spec/platform-support.md` is stale (the TUI migrated to pi-tui, `src/tui/pi.ts`).
- `scripts/check-no-shell-refs.ts` scans `AGENTS.md`, `.agents/` and `scripts/` (`.md`/`.ts`/`.mjs` only) for `.sh` mentions. Root-level `.bat`/`.ps1` files are NOT scanned by it, so the launcher must not ADD a `.sh` reference to `AGENTS.md`/`.agents/`/`scripts/` when documenting itself.

Alternatives considered:

- A single `bun run` cross-platform launcher script (TypeScript) instead of `.bat`/`.ps1` — rejected for THIS ticket: the gap is specifically "a Windows operator double-clicks or runs a launcher", and the epic's Phase-2 single-binary work (`T2.1`) is the place a compiled entry point belongs. A TS launcher would still require `bun` on PATH and a working install before it can run, which is exactly what the `.bat`/`.ps1` pair bootstraps.
- A `.bat` that simply wraps `powershell -File start.ps1` (single implementation, thin `.bat` shim) — CHOSEN: only ONE script holds the logic so the policy cannot drift.
- Shipping only `.ps1` — rejected: `cmd.exe` is still the default shell on many Windows installs and the epic's portability goal is "works without a POSIX shell".
- Making the launcher parse the child's stderr for `EADDRINUSE` / "Is port N in use?" — rejected: that string is Bun-version-specific (measured, not documented) and a pre-flight check produces the hint before the crash instead of after.

**Acceptance Criteria:**

- [ ] `start.bat` and `start.ps1` exist at repo root and are tracked by git (they are not covered by any `.gitignore` rule), and `REUSE.toml`'s root aggregate annotation covers `*.bat` and `*.ps1` so the new files are in the licence registry
- [ ] the mode-selection surface exists in exactly ONE of the two scripts; the other only forwards to it (default `server` → `bun run start`, and a `tui` mode → `bun run tui`); the mode is documented in the script header that holds the logic
- [ ] when `node_modules` is missing, the script runs `bun install --frozen-lockfile` before the target command; when it exists, no install runs; a failed install aborts the launch with a non-zero exit and prints the install error
- [ ] when `bun` is not on PATH, the script prints an actionable message naming bun (and where to get it) instead of a bare "command not found"
- [ ] `NODE_ENV` handling is explicit and documented in the script header: an operator-set `NODE_ENV` is honored unchanged; the launcher never forces `NODE_ENV=production` for a plain-HTTP local start (plain HTTP + `production` makes the auth/CSRF cookie `Secure` and breaks login — `src/routes/auth/shared.ts:91-95`, `src/middleware/csrf.ts:344`; escape hatch `LL_COOKIE_SECURE`); any value the launcher does set states the first-boot-promotion and telemetry consequences
- [ ] a port conflict is detected BEFORE the server starts (pre-flight check of the effective port) and produces an actionable message naming the effective port (default 3000, `packages/core/src/config/sections/server.ts:13`) and the `PORT` override (`packages/core/src/config/schema-class/env-map.ts:109`); the launcher does not retry the bind and does not pick another port
- [ ] the port-conflict hint works while the server-side friendly message (`TASK-friendly-port-conflict-error-on-boot-eaddrinuse`) is still `Not Started` — the hint is produced by the launcher, not by the server, and does not depend on parsing Bun's error text
- [ ] the launcher does not add a frontend build step — `bun run start` already auto-builds at boot (`src/server/init-asset-compression.ts:26-37` via `src/server/start.ts:342`)
- [ ] the TUI mode prints the base URL it will use and exports `LOOP_LORE_API_BASE_URL` when the port was overridden, matching `src/tui/chat/api.ts:11` (`LOOP_LORE_API_BASE_URL ?? "http://localhost:3000"`)
- [ ] the TUI mode states that a ConPTY-capable terminal (Windows Terminal) is required, per `docs/guide/installation.md:20` and `docs/spec/terminal-ui.md:27`
- [ ] neither script relies on bash/WSL/Git Bash, POSIX paths, `chmod`, `pwsh`-only syntax, or a POSIX-only tool
- [ ] the `.bat` runs correctly under `cmd.exe` with the line endings it is committed with (CRLF via a `.gitattributes` entry `*.bat text eol=crlf`, or no label/multi-line-block constructs), and the `.bat` → `.ps1` forwarding works without the operator changing the machine execution policy
- [ ] the scripts are documented in `docs/guide/installation.md` (Windows section) and referenced from `docs/guide/getting-started.md`
- [ ] a smoke check exists that proves the scripts parse and dispatch correctly (e.g. a dry-run/print-path mode that prints the resolved mode, port, `NODE_ENV` decision and install decision without executing, so a test can assert on it) — the launcher logic is not left untested
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
