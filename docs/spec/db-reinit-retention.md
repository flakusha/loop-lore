# Database Reinit & Backup Retention

> **Status:** Implemented (resolves `BUG-db-reinit-archive-directory-has-no-rotation`).
> Implementation: `src/db/reinit.ts` + `src/db/reinit-archive.ts`.

## Why

`bun run db:reinit` is destructive — it drops the SQLite file and rebuilds it
from migrations + seeds. The previous DB file is moved into a sibling
`loop-lore-data-backup/` directory with an ISO timestamp prefix, so an
operator can roll back if the new build is bad. **Without retention, every
reinit grows that directory by one full plaintext PII snapshot, forever.**
That collides with right-to-erasure (GDPR), disk-cap alarms, and the
"don't keep plaintext credentials longer than needed" baseline.

## Retention policy

| Limit      | Default | Env override                     | What it does                                                                 |
| ---------- | ------- | -------------------------------- | ---------------------------------------------------------------------------- |
| Count cap  | `10`    | `LOOP_LORE_REINIT_MAX_ARCHIVES`  | Oldest archives beyond this count are deleted (newest kept).                 |
| Age cap    | `90d`   | `LOOP_LORE_REINIT_MAX_AGE_DAYS`  | Any archive whose name starts with a parseable stamp older than this is purged. |

Both limits apply on every `archiveFile()` call (after the rename step),
so the directory is never bigger than the limits. Files in the backup
directory whose basename does **not** parse as an archive stamp (`README.md`,
`manual-snapshot.tar`, etc.) are left untouched — operators can drop
whatever they want into the directory without it being auto-deleted.

## Archive naming

`archiveFile()` renames the source into:

```
<ISO-stamp>-<original-basename>
```

The filesystem-safe stamp replaces `:` and `.` with `-`:
`2026-09-15T10:17:08.123Z` → `2026-09-15T10-17-08-123Z`.
`parseArchiveStamp()` reverses the substitution and parses it back as
ISO. Files where the regex does not match the prefix are skipped.

## Archive directory location

| Source             | Path                                                       |
| ------------------ | ---------------------------------------------------------- |
| `LOOP_LORE_BACKUP_DIR` env (if set) | that path verbatim                          |
| Default            | `<DATA_DIR>/../loop-lore-data-backup`                      |

The env override is intended for production deployments where archives
should live on a separate, cheaper volume (object storage via FUSE mount,
etc.) — operators can rotate or expire a whole archive mount without
touching code.

## Operational notes

- **Reads**: nothing in the running app reads from this directory — the
  retention logic is the only consumer.
- **Writes**: only `archiveFile()` writes here. Operators can pre-place
  files in the dir; they will not be deleted as long as their names do
  not start with a stamp prefix.
- **Failure mode**: if `readdirSync` fails (perms, FS gone) pruning is
  skipped with a warning. The next `archiveFile()` call retries. No
  data loss — at worst, retention drift until the next reinit.
- **Re-encryption at rest**: not implemented. Optional follow-up
  (per ticket Fix #16); the same KEK file the app uses would encrypt
  archives before they sit on a remote volume.

## Verification

`src/db/reinit-archive.test.ts` covers:

- Parses the move-at stamp from an archive name and from arbitrary names.
- Pruning evicts oldest first when count exceeds `MAX_ARCHIVES`.
- Pruning drops anything older than `MAX_AGE_DAYS` regardless of count.
- Non-archive files in the backup dir are left untouched.
- Missing/unreadable backup dir does not throw.
- `archiveFile()` actually moves the file and triggers retention.
