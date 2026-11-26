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

`<instance>` is selected in this order:

1. `LOOP_LORE_INSTANCE` — the `--instance <name>` flag sets it and wins over
   a pre-existing env value.
2. The effective server bind (loaded `config.server`: flag > env > config file
   > default): `port-<port>`, plus `-<host>` when the host differs from the
   default `localhost`. The same port on different hosts therefore gets
   different dirs.
3. `PORT` / `HOST` env when no bind port is configured. When `PORT` alone
   picks the dir, a one-line stderr warning names it (once per process).
4. `default` when none of the above is set.

An ephemeral port of `0` cannot name a stable dir: resolution throws and asks
for `--instance` / `LOOP_LORE_INSTANCE`. The HTTP server and the MCP/ACP stdio
mains pin the effective bind at startup (`setEffectiveServerBind`), so every
resolver that omits an explicit `server` argument derives the DB and runtime
dirs from the same slug; an explicit `server` argument still wins.

| Path | Contents |
| --- | --- |
| `$STATE/<instance>/loop-lore.db` | Live SQLite database |
| `$STATE/<instance>/uploads/` | Gallery assets (`raw/`, `compressed/`, thumbs) |
| `$STATE/<instance>/certs/` | TLS `key.pem` + `cert.pem` (auto-generated) |
| `$STATE/<instance>/backups/db/` | DB snapshots (see "Database backup and restore") |
| `$STATE/<instance>/stdio-proxy.token` | Bearer token for the stdio-proxy listener (owner-only `0600`, minted at boot) |
| `$STATE/<instance>/stdio-proxy.addr` | Listener `host:port` written at boot (read by bare `--proxy` shims; removed on clean shutdown) |

Every row above uses the SAME resolved `<instance>`: the database, exec log, uploads, certs and backups all live in that one directory. A configured absolute `assets.uploadDir` or `server.tls` path is the operator's explicit choice and wins.

Run a second copy with `--instance demo` (or
`LOOP_LORE_INSTANCE=demo`) and the two never share a sqlite file.
Two writers on one file stay forbidden: the runtime warns loudly when
`LOOP_LORE_DB_PATH` is pinned, but it cannot detect a second process on the
same file.

## Overrides

Explicit paths always win and skip the instance dir:
`LOOP_LORE_DB_PATH`, `ASSETS_UPLOAD_DIR`, `TLS_KEY` / `TLS_CERT`,
`LOOP_LORE_BACKUP_DIR`, and the `getDatabase(path)` argument.

### Database file

The live SQLite file is chosen by the `getDatabase(path)` argument, else
`LOOP_LORE_DB_PATH`, else `$STATE/<instance>/loop-lore.db`, where `<instance>`
is resolved from the effective bind above. `config.db.sqliteFilename` is
currently ignored at runtime — the runtime never reads it — so set
`LOOP_LORE_DB_PATH` (or pass a path to `getDatabase(path)`) to move the
database.

## Database backup and restore

### Where backups land

Snapshots go to a `db/` subtree of the instance archive root, so they never
mix with file archives:

- Default: `$STATE/<instance>/backups/db/`
- With `LOOP_LORE_BACKUP_DIR=<root>`: `<root>/<instance-slug>/db/` — the env
  value is a root, not the snapshot dir itself; the instance slug is still
  appended, so two instances on a shared volume keep separate pools.

### Taking a backup

Admin panel → **Backups** tab → **Create backup**, or
`POST /api/admin/db/backup` (admin permission required). The snapshot is
taken with SQLite `VACUUM INTO`, which serializes against writers for a
consistent point-in-time copy, and the result is verified to be a SQLite
database before it is reported as created. `GET /api/admin/db/backup` lists
existing snapshots with name, size, and modification time.

The same tab downloads a snapshot with **Download** and accepts a validated
`.db` file through **Upload snapshot**; both routes require `admin.system`.

### Scheduled snapshots

Set `[db] backupEnabled = true` (default `false`) to let the existing
event-driven backup scheduler write a `VACUUM INTO` snapshot on chat-end,
asset-upload, world-save and explicit DB-snapshot triggers. No second timer
is started; leaving the flag off keeps the manual-only flow.
`[db] snapshotRetention` (default `10`, minimum `1`) caps the files kept in
the backup directory: after each scheduled write the oldest snapshots beyond
the cap are pruned. Retention applies to manual snapshots in the same
directory too.

### Restoring a backup

Admin panel → **Backups** tab → **Restore** on a snapshot, or
`POST /api/admin/db/restore` with body `{ "name": "<snapshot>", "confirmation": "RESTORE" }`:

1. The target is validated as a SQLite database (magic-byte check); a
   non-database file is rejected before anything is touched.
2. A snapshot of the current live database is written first — your rollback
   point, reported back as `preRestoreBackup`.
3. The live handles are closed, stale `-wal`/`-shm` sidecars are removed, and
   the snapshot atomically replaces the live database file.
4. The response carries `restartRequired: true`.

**Restart the server after a restore.** Handles captured before the restore
are dead once the file is replaced, so the process must be restarted before
the restored database is served. If a restore turns out wrong, restore the
pre-restore snapshot from the same `db/` directory the same way.

## Secret-bearing files

- `$STATE/<instance>/certs/key.pem` — TLS private key (openssl
  default permissions; restrict with `chmod 600` on shared hosts).
- `$STATE/<instance>/stdio-proxy.token` — bearer token for the
  local-only stdio-proxy listener (Design B). Minted at boot when an
  inbound server is enabled, `0600`, self-healed on every read. A
  `--proxy` shim presents it on its handshake line; bad/missing tokens
  are refused and audited. Never copy it off the host.
- `config.local.yaml` (`config/` dir, mode `0600`) — first-boot
  generated PII secrets. This one lives with config, not state.

## Stdio while the server runs (Design B)

The MCP/ACP stdio mains accept `--proxy [host:port]`: the thin shim
process owns stdio and relays bytes to the running server's loopback-only
listener instead of opening the database itself. Every op runs through the
live facade registry and DB-backed history server-side, so proxied ops are
audited exactly like local turns. With no address, `--proxy` reads
`$STATE/<instance>/stdio-proxy.addr` (same instance dir, so the same
environment the server runs with). The listener bind
(`integrations.inbound.proxyBind`) defaults to `127.0.0.1`; a non-loopback
value refuses to start — remote bind needs TLS+token and is a future
ticket. Never-stop semantics: stdio EOF/close ends only that relay
connection; the server and its listener keep running.

## Moving legacy repo-local data

No auto-migration: if `packages/core/loop-lore-data/` exists from an
older checkout, the server logs a one-per-process warning with the
exact `cp -a` move, serves the new (empty) location, and leaves the
legacy copy readable until you remove it.
