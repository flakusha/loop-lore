<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Import YAML/TOML config into system_config DB

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

Add `POST /api/admin/system-config/import` endpoint that accepts a YAML or TOML upload, parses it, validates per-key against the schema, persists via setConfig(). Mirror of the existing `export` endpoint (`GET /api/admin/system-config/export?format=yaml|toml`). Returns a per-key diff (added/changed/skipped/conflict) for the frontend. Secret-key regex (`secret|password|token|api.?key|private.?key|mesh.?psk|encryption.?key|signed.?url|db\.url|database.?url`) is read but NOT echoed back in the diff response.

## Acceptance Criteria

- [ ] `POST /api/admin/system-config/import` accepts multipart upload or JSON body with `{ content: string, format: "yaml" | "toml" }`
- [ ] Per-key parse + schema validation; invalid format/size returns 400
- [ ] Per-key persistence via existing `setConfig`; secret-pattern keys are NOT echoed
- [ ] Returns per-key diff: `{ key, action: "added" | "changed" | "skipped" | "conflict", error?: string }`
- [ ] Audit log entry written (`action: "system-config.import"`)
- [ ] Tests: valid import, invalid format, secret redaction, conflict detection
- [ ] Documentation updated
