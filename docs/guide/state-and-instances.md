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
| `$STATE/<instance>/stdio-proxy.token` | Bearer token for the stdio-proxy listener (owner-only `0600`, minted at boot) |
| `$STATE/<instance>/stdio-proxy.addr` | Listener `host:port` written at boot (read by bare `--proxy` shims; removed on clean shutdown) |

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
