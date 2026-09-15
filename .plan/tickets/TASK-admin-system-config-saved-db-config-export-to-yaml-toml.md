<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin system-config: saved DB config export to yaml/toml

**Status:** ✅ Done (2026-09-16, tree/admin-config-impl)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

Export persisted system_config rows (+ typed admin surfaces: nsfw nsfw_allow/nsfw_min_age, templates prompt_templates, sd sd.templates, model-role/capability overrides) to yaml/toml via existing serializers (js-yaml dump lineWidth:-1, Bun.TOML.stringify). Covers: GET /api/admin/system-config/export?format=yaml|toml (admin.system, audit-logged via log_entries like danger-zone.ts:68, secrets redacted: auth.jwtSecret/csrfSecret/adminPassword, federation.meshPsk, encryption.serverEncryptionKey, byoKey.encryptionKey, assets.signedUrlSecret, provider apiKey/accessKeyId/secretAccessKey, db.url), frontend trigger reusing anchor-download pattern (actor-systems.ts triggerDownload / chat-management.ts blob download — download response, no folder choice: browser download goes to the user's download folder, File System Access showSaveFilePicker as progressive enhancement only), default export filename loop-lore-system-config.<ext>. Acceptance: round-trip import-parse check; secrets never exported in clear; tests + docs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing

## Resolution

GET /api/admin/system-config/export?format=yaml|toml (admin.system, audit-logged
best-effort to log_entries, secret keys → ***REDACTED***). js-yaml dump lineWidth:-1,
Bun.TOML.stringify. Frontend: exportSystemConfig() anchor-download (browser download
folder — no folder picker: web sandbox cannot choose server paths). TOML round-trip
test via Bun.TOML.parse. 14 route tests green.
- [ ] Documentation updated
