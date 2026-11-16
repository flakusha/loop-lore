<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# State and instances

Runtime state (SQLite DB, uploads, TLS certs, backups) lives under the
XDG state dir — never inside the repo checkout. `git clean -fdx` and
repo deletion no longer destroy user data.

## Where state lives

`$STATE` is `$LOOP_LORE_STATE_DIR`, else `$XDG_STATE_HOME/loop-lore`,
else `~/.local/state/loop-lore`. Every server, TUI, and CLI command
resolves the same root, so all of them see the same data.

## Per-instance directories

`<instance>` is `--instance <name>`, else `$LOOP_LORE_INSTANCE`,
else `port-$PORT`, else `default`:

| Path | Contents |
| --- | --- |
| `$STATE/<instance>/loop-lore.db` | Live SQLite database |
| `$STATE/<instance>/uploads/` | Gallery assets (`raw/`, `compressed/`, thumbs) |
| `$STATE/<instance>/certs/` | TLS `key.pem` + `cert.pem` (auto-generated) |
| `$STATE/loop-lore-data-backup/db/` | DB snapshots (shared across instances) |

Run a second copy with `--instance demo` (or
`LOOP_LORE_INSTANCE=demo`) and the two never share a sqlite file.
Two writers on one file stay forbidden.

## Overrides

Explicit paths always win and skip the instance dir:
`LOOP_LORE_DB_PATH`, `ASSETS_UPLOAD_DIR`, `TLS_KEY` / `TLS_CERT`,
`LOOP_LORE_BACKUP_DIR`, and the `getDatabase(path)` argument.
`config.db.sqliteFilename` is ignored at runtime — set
`LOOP_LORE_DB_PATH` instead.

## Secret-bearing files

- `$STATE/<instance>/certs/key.pem` — TLS private key (openssl
  default permissions; restrict with `chmod 600` on shared hosts).
- `config.local.yaml` (`config/` dir, mode `0600`) — first-boot
  generated PII secrets. This one lives with config, not state.

## Moving legacy repo-local data

No auto-migration: if `packages/core/loop-lore-data/` exists from an
older checkout, the server logs a one-per-process warning with the
exact `cp -a` move, serves the new (empty) location, and leaves the
legacy copy readable until you remove it.
