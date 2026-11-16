# XDG state storage

Runtime state (SQLite DB, uploads, TLS certs, backups) lives under the XDG
state dir — never inside the repo checkout. `git clean -fdx` and repo deletion
no longer destroy user data.

## Precedence

Explicit path env > XDG default > config-file value:

| Knob | Explicit env (wins) | XDG default | Config file |
| --- | --- | --- | --- |
| Live DB | `LOOP_LORE_DB_PATH` / `getDatabase(path)` arg | `$STATE/<instance>/loop-lore.db` | `db.sqliteFilename` **IGNORED** at runtime |
| Uploads | `ASSETS_UPLOAD_DIR` | `$STATE/<instance>/uploads` | `assets.uploadDir` honored when no env is set |
| TLS key/cert | `TLS_KEY` / `TLS_CERT` | `$STATE/<instance>/certs/key.pem`, `cert.pem` | `server.tls` honored when no env is set |
| Backups | `LOOP_LORE_BACKUP_DIR` | `$STATE/loop-lore-data-backup/db/` | n/a |
| Whole tree | `LOOP_LORE_STATE_DIR` | — | n/a |

`$STATE` is `$LOOP_LORE_STATE_DIR`, else `$XDG_STATE_HOME/loop-lore`, else
`~/.local/state/loop-lore`. `<instance>` is `$LOOP_LORE_INSTANCE`, else
`port-$PORT`, else `default` — two instances on different ports (or with
different names) never share a sqlite file. Two writers on one file stay
forbidden: the boot `INSTANCE_COUNT` guard (postgres required for real
multi-writer) is unchanged, and `getDatabase()` throws when the resolved path
changes under a live singleton instead of silently serving the wrong file.

`config.db.sqliteFilename` is documented as ignored because the runtime never
read it — wiring the config loader into the DB singleton would risk import
cycles for a knob that never took effect. Use `LOOP_LORE_DB_PATH`.

## `--instance <name>`

Explicit instance selection: `lolo --instance <name> …`,
`loop-lore-lsp --instance <name> --stdio`, or `bun run src/server/index.ts
--instance <name>` serve `$STATE/<name>/` with byte-identical structure
(`loop-lore.db`, `uploads/`, `certs/`, `backups/` sibling). The flag wins over
`LOOP_LORE_INSTANCE` env (explicit > env); with neither, the default chain
applies (`$LOOP_LORE_INSTANCE`, else `port-$PORT`, else `default`) and paths
are unchanged. Bad names (`../`, empty, flag-like) fail loud at boot — never
silently remapped.

## Migration (docs only, no auto-migration)

If a legacy repo-local `packages/core/loop-lore-data/loop-lore.db` exists,
the server logs a one-per-process warning with the exact move:

```sh
cp -a packages/core/loop-lore-data/loop-lore.db \
  "$XDG_STATE_HOME/loop-lore/<instance>/loop-lore.db"
# verify the app boots on the new path, then remove the legacy copy
```

Uploads move the same way (`uploads/` under the legacy dir to
`$STATE/<instance>/uploads/`); backups under `loop-lore-data-backup/` keep
working via `LOOP_LORE_BACKUP_DIR`. Config-file ports without a matching
`PORT` env or `LOOP_LORE_INSTANCE` share the `default` instance dir — set
`LOOP_LORE_INSTANCE` for a stable name.
