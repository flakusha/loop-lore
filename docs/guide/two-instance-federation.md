<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Two instances on one machine

Several instances of Loop Lore can run side by side on ONE machine. Each
instance gets its own database, its own file storage and its own harness
exec log under the XDG state dir. Nothing is shared, so two instances never
write to the same SQLite file.

This is the local-machine scenario: isolation only. Two local instances share
nothing with each other. The separate federation mesh (`config.federation`,
disabled by default) federates a host with REMOTE peers over the network; it
does not make two instances on one machine share state (see "Known limits").

## The knobs

| Knob | Meaning |
| --- | --- |
| `--instance <name>` / `LOOP_LORE_INSTANCE` | Instance slug. Picks the state subdir `<state>/<name>/`. The flag wins over the env var. |
| `LOOP_LORE_STATE_DIR` | Full-tree override of the state root. |
| `XDG_STATE_HOME` | Base dir; `loop-lore` is appended to it. |
| `LOOP_LORE_DB_PATH` | Explicit live-database path. Wins over the per-instance default. |
| `PORT` / `HOST` | Port and host of the instance. A port-only instance is named `port-<port>`. |

Precedence for the state root: `LOOP_LORE_STATE_DIR`, else
`$XDG_STATE_HOME/loop-lore`, else `~/.local/state/loop-lore`.
Precedence for the instance name: `--instance` / `LOOP_LORE_INSTANCE`, else
the effective server bind (`port-<port>`, plus `-<host>` when the host is
not `localhost`), else `PORT` / `HOST`, else `default`.

Per-instance layout under the state root:

| Path | Contents |
| --- | --- |
| `<state>/<instance>/loop-lore.db` | Live SQLite database |
| `<state>/<instance>/uploads/` | Gallery assets |
| `<state>/<instance>/certs/` | TLS `key.pem` + `cert.pem` |
| `<state>/<instance>/backups/` | Instance archive root (DB snapshots in `backups/db/`) |
| `<state>/<instance>/harness/executions.jsonl` | Harness exec log |

Every row above resolves to the SAME instance dir: the database, uploads,
certs, backups and exec log never split across two directories. With no
`--instance`, `<instance>` follows the effective bind (`port-<port>`), so the
whole set stays together.

## Run the harness

The harness prints the resolved layout for N instances and checks the
isolation invariants:

```bash
bun scripts/dev/two-instance-harness.ts --slug alpha --slug beta
bun scripts/dev/two-instance-harness.ts --slug a --slug b --slug c
```

Reading the table: one row per instance, columns `slug`, `port`, instance
state dir, db path, uploads dir and exec log path. All four paths must differ
per row; the db path, uploads dir and exec log path must each sit inside that
instance's state dir; and the requested slug must survive the resolver
unchanged. The script exits non-zero and prints `FAIL: ...` lines when an
invariant breaks, so it is usable as a smoke check in CI as well.

Add `--boot` to actually start the instances and probe the port conflict:

```bash
bun scripts/dev/two-instance-harness.ts --boot --port 4310
```

Boot mode runs the app entry from the `dev` script (`src/server/index.ts`)
with `--instance` and a distinct `PORT` per instance, inside a scratch state
root under `.tmp/` — so the printed table shows those scratch paths, the same
ones the booted instances use. It then starts one more instance on an
already-bound port and requires that instance to fail loudly.

## Verify isolation by hand

1. Start two instances, e.g. `bun run start --instance alpha` and
   `bun run start --instance beta`, with different `PORT` values.
2. Open the two database files listed in the harness table
   (`sqlite3 <state>/alpha/loop-lore.db` and the `beta` one). They are
   different files with different content; a row written in one instance is
   not visible in the other.
3. List the two uploads dirs. Each holds only its own assets (`raw/`
   originals, `compressed/` variants and thumbnails).
4. Read the two exec logs (`<state>/<instance>/harness/executions.jsonl`).
   Every record carries the instance slug, so a log line says which instance
   ran the harness.
5. Stop one instance and confirm the other keeps serving — they share no
   file handle.

## Port-conflict expectation

The bind address is resolved ONCE at boot, to a single literal address, and
that literal is what the listener binds. A second instance on the same port
therefore fails with `EADDRINUSE` and the port-conflict message, which names
the port and points at `--instance NAME`.

Without that pinning, the second instance would silently take the NEXT
address of the same host name (for example `::1` after `127.0.0.1`) and both
instances would look "running" on one port, with no error and no log line.
Loud failure is the intended behaviour: fix it with `--instance NAME` (each
instance gets its own state dir) rather than by changing `PORT` alone, which
would silently switch databases.

## Known limits

- Single machine only. Two instances on one host are isolated from each
  other: there is no cross-instance sharing or sync between them, so each one
  keeps its own copy of everything it owns.
- Backups are already per-instance (`<state>/<instance>/backups/`, and a
  `LOOP_LORE_BACKUP_DIR` root gets the slug appended). What still needs
  operator triage is a PRE-XDG install: the runtime names BOTH legacy
  locations once per process and prints the exact `cp -a` move for each — the
  legacy DATABASE (`packages/core/loop-lore-data/loop-lore.db`,
  `loop-lore-data/loop-lore.db`, `data/loop-lore.db`,
  `../loop-lore-data/loop-lore.db`) and the legacy BACKUP POOL, the sibling
  `loop-lore-data-backup/` (`packages/core/loop-lore-data-backup/`,
  `loop-lore-data-backup/`, `../loop-lore-data-backup/`). It never moves or
  reads either one.
- jj / pijul support is NOT here. It is filed in the `giwt` repository, which
  owns the VCS seam; this repo has no jj or pijul source.
