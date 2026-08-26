# BUG: db-reinit archive directory has no rotation; PII accumulates indefinitely

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/db/reinit.ts (commit 19d136b8) introduced archiveFile() which renames the previous DB/WAL/SHM into  (default ../loop-lore-data-backup/) with an ISO timestamp prefix. No rotation policy, no size cap, no encryption-at-rest for the archived files, no max-age pruning.

Consequences:
- Production servers running reinit regularly will accumulate full plaintext DB copies indefinitely. Each archive contains the entire user-content store: messages (some encrypted, some gzip plaintext), music-link metadata, nsfw preferences, admin audit trail, sessions, etc.
- If backup_dir is on the same volume as DATA_DIR, a full reinit cycle doubles disk usage with no automatic cleanup.
- GDPR/PII: each archive is a fresh PII snapshot. Retention policy is undefined — this conflicts with right-to-erasure if the archive outlives the user's account.

Fix:
- Add MAX_ARCHIVES (default 5) and/or MAX_ARCHIVE_AGE_DAYS (default 30) — purge oldest on archive.
- Optional: re-encrypt archives using a separate KEK (loop-lore-data-backup.key) so a stolen backup file alone is not enough to read PII.
- Document the retention policy in docs/spec and in the reinit script header.

Severity: medium. Operational risk + compliance.

Tests: unit-test archiveFile to assert it deletes archives beyond MAX_ARCHIVES, sorts by timestamp, and refuses to delete when the dir is missing (no exception thrown for empty dir).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
