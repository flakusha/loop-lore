<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser-Storage Backup (Opt-In)

**Status:** ⬜ Open
**Priority:** high
**Effort:** medium
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-schema`
- `epic-content-hashing-distributed-integrity.md` — canonical
  record hash used for reconciliation
- `TASK-resource-provision-reconciliation`

## Summary

Implement the browser-side backup path: an opt-in settings
toggle, IndexedDB export of chats, assets, and world data,
content-hash computation, and storage under the `ll-backup::`
namespace. This is the user-controlled, offline-capable mirror
of the external-storage backup path.

## Context

Browser storage is the simplest backup target: no server
dependency, no separate account, works offline. Users opt in
per resource type. Each backup blob is anchored to a SHA-256
content hash so the reconciliation engine (`TASK-resource-provision-reconciliation`)
can detect drift against the canonical server-side record hash
(`X-Record-Hash` from `epic-content-hashing-distributed-integrity.md`).

## Design

```typescript
interface BackupManifest {
  namespace: "ll-backup";
  resourceType: "chat" | "asset" | "world" | "lore";
  ownerId: string;
  entries: Array<{
    id: string;
    contentHash: string;
    version: number;
    createdAt: Date;
  }>;
  manifestHash: string;   // SHA-256 of the manifest JSON
}
```

- Export serializes the requested data into a structured blob.
- Hash is computed over the full blob (not per-entry) so a
  single-byte drift is detectable.
- IndexedDB namespace `ll-backup::` isolates from other storage.
- Backup rotation keeps the N most recent per resource type
  (configurable, default 10).

## Acceptance Criteria

- [ ] Settings toggle: "Enable browser backup" (opt-in, default off)
- [ ] Per-resource-type selectors: chats, assets, world data, lore
- [ ] `src/backup/browser-backup.ts` — `exportBackup`,
  `listBackups`, `deleteBackup`, `getManifest`
- [ ] Export serializes selected data into a structured blob;
  computes SHA-256 over the full blob
- [ ] Persisted in IndexedDB under `ll-backup::` namespace
- [ ] Backup rotation: keep N most recent per resource type
  (default 10); oldest evicted first
- [ ] `manifestHash` covers the entire manifest; any mutation
  invalidates it
- [ ] `getManifest` returns the current manifest and manifest hash
  for the reconciliation engine to compare
- [ ] Quota check: refuse new backups if total backup storage
  exceeds a configurable browser quota (default 50 MB)
- [ ] Unit tests: export, hash computation, IndexedDB round-trip,
  rotation eviction, manifest integrity, quota enforcement
- [ ] `bun run check` green
