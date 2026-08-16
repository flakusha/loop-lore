<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: DB & Asset Snapshot Recovery

**Status:** 🔵 Research
**Priority:** High
**Effort:** High
**Type:** Research & Planning Epic
**Tags:** database, backup, recovery, snapshots, disaster-recovery

## Summary

Research and plan comprehensive database and asset snapshot/recovery system. Covers full database backup/restore, asset storage snapshots, character data export/import, and disaster recovery procedures. No implementation — research only.

## Current State

### Database

- **Engine**: `bun:sqlite` with Kysely query builder
- **Migrations**: 28 migrations in `src/db/migrations/`
- **Tables**: 60+ tables across core, character, story, crafting, generation, content, synthetic, telemetry domains
- **No backup system**: No automated backup, snapshot, or recovery mechanisms exist
- **No point-in-time recovery**: No WAL archiving, no incremental backups

### Assets

- **Storage**: `src/assets/` with CRUD controller
- **Backend**: `StorageBackend` enum (likely local filesystem)
- **Links**: Polymorphic `asset_links` table (characters, messages, worlds, etc.)
- **No snapshot**: Assets stored as files, no versioning or backup
- **No deduplication**: No content-addressable storage

### Character Data

- **Export formats**: CCv2, CCv3, TOML, YAML (in `src/characters/exporters/`)
- **Import**: `CanonicalCharacter` parser in `src/characters/parser`
- **Assets**: `CharacterAsset` type for embedded assets
- **CharX**: Custom format with embedded assets (`src/characters/charx.ts`)
- **Missing types**: `CharacterAsset`, `CanonicalCharacter` exports missing (typecheck failure)

### Data States

- **Archival**: Spec exists (`docs/spec/archival-workflow.md`) but NOT implemented
- **States**: active → archived → purged
- **Cascade**: Archive/restore/purge cascade rules defined
- **Retention**: 90-day default, configurable

## Research Areas

### 1. Database Backup Strategies

#### Full Backup

- SQLite `.backup()` API (Bun compatible?)
- File copy of `.db` file (simple but requires lock)
- Kysely-based data export (JSON/CSV)

#### Incremental Backup

- WAL (Write-Ahead Logging) archiving
- Checkpoint-based incremental
- Change data capture (CDC) via triggers

#### Point-in-Time Recovery

- WAL segment retention
- Binary log equivalent for SQLite
- Replay mechanism

### 2. Asset Storage Snapshots

#### Content-Addressable Storage

- Hash-based deduplication (SHA-256)
- Immutable content store
- Reference counting for garbage collection

#### Versioning

- Asset version history
- Diff-based versioning (for text/configs)
- Full copy versioning (for images/media)

#### Snapshot Mechanisms

- Filesystem snapshots (LVM, ZFS, Btrfs)
- Application-level snapshots (tar/zip bundles)
- Cloud storage snapshots (S3 versioning)

### 3. Character Data Recovery

#### Export Formats

- CCv2/CCv3 compatibility
- JSON canonical format
- TOML/YAML human-readable formats

#### Import Validation

- Schema validation
- Asset reference integrity
- Version compatibility checks

#### Bundle Format

- Character + assets in single file
- Manifest for integrity checking
- Compression options

### 4. Disaster Recovery

#### Recovery Time Objective (RTO)

- Target: < 5 minutes for full restore
- Target: < 1 minute for point-in-time

#### Recovery Point Objective (RPO)

- Target: < 1 hour data loss (full backup interval)
- Target: < 5 minutes data loss (incremental)

#### Recovery Procedures

- Automated backup verification
- Restore testing scripts
- Rollback procedures

### 5. Migration & Schema Recovery

#### Schema Versioning

- Migration chain integrity
- Rollback migrations
- Schema diff tools

#### Data Migration

- Versioned data formats
- Backward compatibility
- Forward migration scripts

## Technical Notes

### SQLite Backup API

```typescript
// SQLite backup via Bun
const backup = await db.backup("backup.db",);
// Or via Kysely raw query
await db.executeQuery(sql`VACUUM INTO ${sql.ref("backup.db",)}`,);
```

### WAL Archiving

```bash
# SQLite WAL archiving
sqlite3 .db "PRAGMA wal_checkpoint(TRUNCATE)"
# Archive WAL files for point-in-time recovery
```

### Asset Bundling

```typescript
// Character bundle format
interface CharacterBundle {
  manifest: {
    version: string;
    characterId: string;
    createdAt: string;
    assetCount: number;
  };
  character: CanonicalCharacter;
  assets: Array<{
    path: string;
    hash: string;
    data: Buffer;
  }>;
}
```

## Open Questions

1. **Bun SQLite backup**: Does `bun:sqlite` support `.backup()` API?
2. **WAL archiving**: Can we archive WAL segments for point-in-time recovery?
3. **Asset deduplication**: Is content-addressable storage worth the complexity?
4. **Bundle format**: Single-file vs directory-based character bundles?
5. **Compression**: gzip vs zstd for backups?
6. **Encryption**: Should backups be encrypted at rest?

## Acceptance Criteria

- [ ] Research SQLite backup mechanisms in Bun
- [ ] Document asset storage snapshot options
- [ ] Define character bundle format specification
- [ ] Create disaster recovery procedure outline
- [ ] Identify missing schema/migration recovery tools
- [ ] Document open questions and trade-offs
- [ ] Create implementation plan with phases

## Linked Tasks

- TASK-sqlite-backup-research.md
- TASK-asset-snapshot-research.md
- TASK-character-bundle-research.md
- TASK-disaster-recovery-research.md

## Related

- `docs/spec/archival-workflow.md` — message archival (not implemented)
- `docs/frontend/data-states.md` — data state definitions
- `src/db/migrations/` — existing migration patterns
- `src/assets/` — current asset handling
- `src/characters/` — character export/import logic
