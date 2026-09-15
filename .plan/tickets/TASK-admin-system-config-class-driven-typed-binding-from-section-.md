<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin system-config: class-driven typed binding from section meta

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

Derive admin System-tab field types, inputs, and validation from the existing per-section *Meta + *DEFAULTS (src/config/sections/*, src/config/schema-class/json-schema/*) instead of hand-writing per-key UI. Covers: meta->input widget mapping (boolean/integer/string/enum/array/object), secret/env-only redaction (auth.jwtSecret, auth.csrfSecret, auth.adminPassword, federation.meshPsk, encryption.serverEncryptionKey, byoKey.encryptionKey, assets.signedUrlSecret, provider apiKey/accessKeyId/secretAccessKey, db.url), deploy-time read-only marking (federation, testing), runtime-apply wiring per key. Depends on TASK-single-source-of-truth-for-config-schema-mirrors (one meta source). Acceptance: new section renders with zero hand-written field markup; secrets never round-trip values; tests + docs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
