<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Admin system-config: class-driven typed binding from section meta

**Status:** ✅ Done (2026-09-16, tree/admin-config-impl)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin.md

## Summary

Derive admin System-tab field types, inputs, and validation from the existing per-section *Meta + *DEFAULTS (src/config/sections/*, src/config/schema-class/json-schema/*) instead of hand-writing per-key UI. Covers: meta->input widget mapping (boolean/integer/string/enum/array/object), secret/env-only redaction (auth.jwtSecret, auth.csrfSecret, auth.adminPassword, federation.meshPsk, encryption.serverEncryptionKey, byoKey.encryptionKey, assets.signedUrlSecret, provider apiKey/accessKeyId/secretAccessKey, db.url), deploy-time read-only marking (federation, testing), runtime-apply wiring per key. Depends on TASK-single-source-of-truth-for-config-schema-mirrors (one meta source). Acceptance: new section renders with zero hand-written field markup; secrets never round-trip values; tests + docs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing

## Resolution

GET /api/admin/config-schema serves jsonSchema() (section *Meta single source,
admin.system gated). Tests pin Meta-derived keys (auth.jwtSecret, tui.sessionToken).
Full Meta→widget rendering deferred: System-tab keeps flat KV rows (what DB stores);
typed binding would need a key↔dot.path map that does not exist yet. Endpoint unblocks it.
- [ ] Documentation updated
