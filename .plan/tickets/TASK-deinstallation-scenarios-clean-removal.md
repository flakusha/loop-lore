<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Deinstallation scenarios (clean removal)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-first-run-auto-setup
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Uninstall/clean-removal: artifact inventory, scenario table (app-only/data-only/full-wipe), orphaned artifacts, secure deletion of secrets. Promoted from the research note `Research-deinstallation-scenarios.md` (untracked, gitignored `.tmp/research/` in the dev checkout — NOT part of the repo; this ticket body is self-contained and every claim below is re-verified against the code with file:line evidence).

**Context:**

Verified 2026-11-15 against the worktree: there is NO uninstall surface today.

- No `uninstall`/`clean` script in `package.json`; `bin/lolo.ts:37` registers only `{ chat, generate, assets, characters }`.
- `bun run db:reinit` (`src/db/reinit.ts:18-56`) is a DATA RESET, not an app uninstall: it archives the DB + WAL/SHM sidecars into `loop-lore-data-backup/` (`src/db/reinit-archive.ts:26-29`) and re-runs migrations. The archives deliberately survive.
- `docs/guide/installation.md` has no removal section (grep for uninstall/removal → no matches).
- `scripts/backup-sqlite.ts:10` writes snapshots to `BACKUP_DIR ?? tmpdir()`, GPG-encrypted when a recipient is configured (`scripts/backup-sqlite.ts:18`, `:86-89`).

Artifact inventory (paths verified):

| Artifact | Path | Evidence |
|---|---|---|
| SQLite DB (+ `-wal`, `-shm`) | `${DATA_DIR}/loop-lore.db` | `packages/core/src/config/constants.ts:13`; `src/db/index.ts:143` (path), `:45` (`PRAGMA journal_mode = WAL`) |
| Uploads / assets | `${DATA_DIR}/uploads` | `packages/core/src/config/sections/assets.ts:10` |
| TLS certs | `${DATA_DIR}/certs/{key,cert}.pem` | `packages/core/src/config/sections/server.ts:17-18` |
| Reinit archives | `${DATA_DIR}/../loop-lore-data-backup/` | `src/db/reinit-archive.ts:26-29` — but `LOOP_LORE_BACKUP_DIR` overrides it (`:27`), so archives can live OUTSIDE the data root |
| Mangled old DB path | `${cwd}/loop-lore-data/loop-lore.db` | `src/db/reinit.ts:26-32` (archived by reinit, ignored by any uninstaller) |
| Config files | `config.yaml`/`yml`/`toml`, `config.local.*`, `config.default.*`, `config.<domain>.{yaml,yml,toml}`, `env.yaml` — each also under `configs/` | `packages/core/src/config/load/constants.ts:13-40` (candidates + domains); `packages/core/src/config/load/load.ts:93-102` (env.yaml, incl. `configs/env.yaml` + main-root fallback) |
| Promoted secret file | `config.local.yaml`, chmod 0600 | `packages/core/src/config/load/first-boot.ts:42` (`FIRST_BOOT_FILE`), `:140` (`mode: 0o600`), `:145` (`chmodSync`) |
| Per-backend configs | `config.llama-swap.yaml`, `config.llama-cpp.yaml`, `config.sd-cpp.yaml`, `config.e2e.yaml` | `.gitignore:39-42` |
| Build/deps | `dist/`, `node_modules/`, `target/{debug,release}` | `package.json`; `packages/core/src/native/loader.ts:131-146` |
| Scratch | `.tmp/`, `.harness/` | `.gitignore:73,78` |

`DATA_DIR` is a COMPILE-TIME relative constant (`path.resolve(__dirname, "..", "..", "loop-lore-data")`, `packages/core/src/config/constants.ts:13`). Only the DB path is env-overridable (`LOOP_LORE_DB_PATH`, `src/db/index.ts:143`); uploads/certs are not, and the ARCHIVE dir has its own override (`LOOP_LORE_BACKUP_DIR`, `src/db/reinit-archive.ts:27`). Config files are cwd-relative with a `configs/` subdir variant and a main-repo-root fallback (`src/config/load/load.ts:93-102`), so they are not under the data root either. Grep for `LOOP_LORE_DATA_DIR` across the repo → no matches. So there is no single root to point an uninstaller at — that is the prerequisite gap (research §8.2, §9).

Scenario table (research §5, adopted as the acceptance shape):

| Scenario | Removed | Preserved | Risk |
|---|---|---|---|
| app-only | repo, `dist`, `node_modules`, `target`, `.tmp` | `loop-lore-data/`, `loop-lore-data-backup/`, configs, external binaries | reinstall reuses the DB; migrations run on boot |
| data-only | DB + WAL/SHM, uploads, certs, archives, config files | code, deps, builds | destructive; no backup-before-remove guard; orphaned WAL sidecars if the DB is deleted while the server runs |
| full wipe | all of the above + logs + `.harness/` + OS service units (manual) | external binaries (shared, user-owned) | secrets linger in backups/logs; no secure deletion |
| reinstall / upgrade | nothing | data + config | safe today: first-boot promotion skips when ANY config candidate already exists (`packages/core/src/config/load/first-boot.ts:71-73`, `:94-99`) |

Orphaned-artifact risks to cover (verified 2026-11-15):

- leftover `loop-lore-data-backup/` archives after a data-only removal — and note `LOOP_LORE_BACKUP_DIR` can point them outside the data root entirely (`src/db/reinit-archive.ts:27`);
- the mangled `${cwd}/loop-lore-data/loop-lore.db` path (`src/db/reinit.ts:26-32`) — reinit archives it, an uninstaller must not;
- `.tmp/eslint.cache` / coverage / check reports (`.tmp` is gitignored, `.gitignore:73`);
- a gitignored `config.local.yaml` full of plaintext secrets after the repo is deleted (`.gitignore:34`);
- Docker volumes `caddy_data`, `caddy_config`, `pgdata`, `app_data` (`deploy/docker-compose.yml:79-83`) that `docker compose down` (without `-v`) leaves behind;
- systemd units installed by the operator (`docs/ops/bare-metal/systemd/`: `loop-lore.service`, `loop-lore-worker.service`, `backup-sqlite.service`, `backup-zfs-send.service`) — these are installed BY the operator and reference `/opt/loop-lore` + `/etc/loop-lore/secrets.env`, so uninstall must not touch `/etc/loop-lore` silently;
- PATH symlinks to removed binaries: the manual practice is `sudo cp` into `/usr/local/bin` (`docs/ops/bare-metal-deploy.md:284-287`); the `~/.local/bin` link dir is an OPTIONAL, not-yet-shipped feature of the tooling-build path-layout work (`TASK-tooling-build-path-layout.md`, `linkInstalledBinaries` exists in that ticket's scope only, not in `src/` today) — so the sweep should REPORT such links, not delete them.

Security constraints (research §7), verified 2026-11-15:

- `config.local.yaml` is chmod 0600 (`packages/core/src/config/load/first-boot.ts:140`, `:145`) but holds PLAINTEXT generated PII secrets — `nsfw.piiSecret`, `nsfw.reporterHashSecret`, `observability.telemetry.piiSecret` (`packages/core/src/config/load/first-boot.ts:117-125`).
- Reinit archives are PLAINTEXT DB snapshots (`src/db/reinit-archive.ts:37-38` `archiveFile()` moves the raw DB file into the archive dir; retention 10 archives / 90 days via `MAX_ARCHIVES`/`MAX_AGE_DAYS` at `:17-18`, env-overridable). `scripts/backup-sqlite.ts` produces a GPG-encrypted copy only when a recipient is configured (`:18`, `:86-89`).
- Log censoring is OPT-IN and OFF by default: `LOGGING_DEFAULTS` sets only `level` (`packages/core/src/config/sections/logging.ts:8-10`); `censorEnabled` is an optional, undefined-by-default field (`:19`). `jsonlPath` is also optional/unset by default (`:15`), so JSONL logs exist only if the operator configured them.
- No secure deletion / key-wiping exists anywhere in the repo: a repo-wide grep for `shred` / `secure_delete` / `SECURE_DELETE` / `crypto-shred` returns nothing outside this ticket.

Consequence: a full wipe that claims to have removed secrets must not leave them recoverable in archives or logs — at minimum it must archive-or-delete deterministically and say so.

Scope decision (research §9, adopted): the minimal viable change is a documented manual removal section PLUS `lolo uninstall [--keep-data] [--purge] [--backup-first]`. `--purge` archives the DB via the existing snapshot path before deleting and removes the config file that carries secrets. Operator-owned and OUT of scope (the tool must say so rather than silently leave them): the external binaries (`llama-server`, `llama-swap` per `docs/ops/bare-metal-deploy.md:284-287`; `sd-server` per `docs/guide/installation.md:30`), the ComfyUI instance (loop-lore only holds its URL as the system-config key `comfyui_url` — `src/frontend/alpine/admin-models/sd.ts:25`, `:93` — it never clones or manages it), the systemd units in `docs/ops/bare-metal/systemd/`, and the Docker volumes `caddy_data`/`caddy_config`/`pgdata`/`app_data` (`deploy/docker-compose.yml:79-83`).

Do NOT touch:

- Do NOT add a second config/secret store; reuse the existing first-boot writer's file set.
- Do NOT make the uninstaller delete anything outside the loop-lore data root and the repo build outputs — external binaries and OS services are user-owned.
- Do NOT reimplement archiving; reuse `src/db/reinit-archive.ts` `archiveDir()`/`archiveFile()` and `scripts/backup-sqlite.ts` snapshot logic.
- Do NOT silently skip a running server: refuse removal while the DB is locked rather than leaving orphaned WAL sidecars.

**Acceptance Criteria:**

- [ ] `docs/guide/installation.md` gains a "Removal / clean uninstall" section listing every artifact in the inventory table above, with the preserve-vs-remove decision per artifact and the operator-owned exclusions (external binaries, ComfyUI, OS service units, Docker volumes) stated explicitly
- [ ] `lolo uninstall` exists with `--keep-data`, `--purge` and `--backup-first` flags; `--keep-data` removes only app/build artifacts, `--purge` removes the data root (DB + WAL/SHM, uploads, certs, reinit archives, config files carrying secrets), and the default is the conservative one
- [ ] `--purge` creates a snapshot/backup before deleting the DB (reusing `src/db/reinit-archive.ts` / `scripts/backup-sqlite.ts`), and the printed output states where the backup went and that it still contains the purged data
- [ ] the uninstaller refuses to run while the server holds the DB open (no orphaned `-wal`/`-shm` sidecars), and reports what blocked it
- [ ] the uninstaller removes the secrets-bearing config file (`config.local.yaml`) on `--purge` and says plainly that no secure wipe (overwrite/crypto-shred) is performed — secrets may remain recoverable from the filesystem and from any backup the user kept
- [ ] every removed path is printed before deletion (dry-run-able listing), so a user can see the plan without executing it
- [ ] the uninstaller never touches paths outside the loop-lore data root and the repo's own build/scratch outputs; external binaries and OS services are listed as operator-owned leftovers, not deleted
- [ ] a `LOOP_LORE_DATA_DIR`-style single-root override exists (or is explicitly filed as a follow-up blocker) so uploads/certs/archives resolve under one root — the uninstaller must not guess a second root
- [ ] orphaned-artifact sweep REPORTS (does not silently delete) each orphan named in the Context list: leftover `loop-lore-data-backup/` archives, the mangled `${cwd}/loop-lore-data/loop-lore.db`, `.tmp` scratch, the leftover `config.local.yaml`, the Docker volumes, and any PATH symlink pointing at a removed binary
- [ ] unit test covers: `--keep-data` keeps the data root and removes build outputs; `--purge` removes the data root and writes a backup first; a locked DB aborts the purge; no path outside the data root + repo build outputs is ever unlinked
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
