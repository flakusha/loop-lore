<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: External Storage Provisioning & Backup Scheduling

**Status:** ⬜ Open
**Priority:** high
**Effort:** large
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-schema`
- `TASK-resource-provision-credential-store`
- `TASK-resource-provision-routing-facade`
- `TASK-resource-provision-browser-backup`
- `epic-content-hashing-distributed-integrity.md` — canonical
  record hash used for backup integrity

## Summary

Expose routes and UI to register external storage endpoints
(S3-compatible, WebDAV, etc.) with per-endpoint storage quotas,
and schedule automatic backups of chats, assets, and world data
to those endpoints with integrity checks.

## Context

Beyond inference, users want their authored data backed up to
an external store they control. This ticket adds the storage
endpoint provisioning path and the scheduling layer that
orchestrates when backups run (on chat end, on asset upload,
on world save) — configurable and opt-in per resource type.

## Acceptance Criteria

- [ ] Routes: `POST /api/resource/storage` (add),
  `GET /api/resource/storage` (list), `DELETE /api/resource/storage/:id`
  (revoke), `POST /api/resource/storage/:id/test` (test)
- [ ] Add storage endpoint: provider type, base URL/ARN,
  credential (hash/wrapped), storage quota (bytes),
  backup schedule config
- [ ] Credentials stored as hash/wrapped reference only
- [ ] Backup schedule config: event triggers (chat-end,
  asset-upload, world-save) + cadence + resource-type filter
- [ ] Backup job computes content hash over the payload before
  upload; rejects on hash mismatch (drift detected)
- [ ] `backup_records` row created per successful backup
  (linked to the storage endpoint and the source resource)
- [ ] Storage quota enforced: backup refused if it would exceed
  the endpoint's storage ceiling
- [ ] Frontend settings panel: "Storage & Backups" section
- [ ] `TASK-resource-provision-browser-backup` covers the
  browser-side counterpart (IndexedDB) — this ticket covers
  the external-storage path
- [ ] Unit tests: endpoint provisioning, credential verification,
  quota enforcement, backup scheduling triggers
- [ ] `bun run check` green
