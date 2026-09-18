<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend setup wizard: import system_config from YAML/TOML

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

Build a guided 3-step import wizard in `src/views/admin.html` (System tab > new 'Setup' sub-section or a dedicated route):

1. **Upload** — drag-drop or file picker, format auto-detect (yaml/toml)
2. **Preview** — table of `[key, current value, incoming value, action (overwrite/skip)]`; per-row checkbox; secret rows masked in preview
3. **Apply** — submit calls the import endpoint; shows per-row success/error

Bind to `TASK-import-yaml-toml-config-into-system-config-db` for the backend. Validate file size <= 1MB server-side. Reuse `src/frontend/alpine/admin-system.ts` Alpine state, do not duplicate a new component.

Acceptance: a user with a monolithic `config.yaml` can import it into a fresh `system_config` DB in <5 clicks.

## Acceptance Criteria

- [ ] Upload step accepts YAML and TOML (auto-detect)
- [ ] Preview step shows per-row diff with checkbox control
- [ ] Apply step posts to `/api/admin/system-config/import` and renders result inline
- [ ] Secret-key rows display `***REDACTED***` in preview
- [ ] Tests: navigate wizard end-to-end, verify import persists, verify secret masking
- [ ] Documentation updated
