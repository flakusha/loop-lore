<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Wire battle chat-setup template selection into egui frontend

**Status:** Done
**Status Note:** Substantially implemented as uncommitted dev dirt (no branch): api.rs template list/parse/create-body + unit tests, app.rs create form with template ComboBox — needs test run + landing, see Context.
**Epic:** epic-battle-ui
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Depends-on:** src/frontend/pages/new-chat/index.ts, submit.ts, state.ts (web reference, read-only)

**Summary:**

Battle chat-setup template selection exists in web; egui lacks parity. Implement selection on world/chat creation.

**Context:**

Web parity reference: `src/frontend/pages/new-chat/index.ts:30-63` (template list load + `#chat-template` picker), `submit.ts:77,96,115` (templateId POST + renderingOverride), `state.ts:14-29` (ChatTemplateMeta). In-flight (uncommitted dev dirt, no branch): `native/loop-lore-egui/src/api.rs` adds templates_list_url, parse_templates_page, create_chat_body (omits templateId key when None), parse_created_chat + unit tests; `app.rs` adds templates/create_open/new_chat_name/new_chat_template state, reload_templates (lazy GET on first open), create_chat, "+ New" button + template ComboBox ("None" default), opens the new chat on Created. Remaining work is running the Rust tests + landing the dirt.

**Acceptance Criteria:**

- [ ] "+ New" opens the create form; template ComboBox lists GET /api/v1/chat-setup-templates ("None" default, lazy-loaded on first open)
- [ ] Create POSTs {name} + optional templateId (key omitted when None — web parity), then opens the new chat
- [ ] Rust unit tests for template parse/create-body present in the dirt — run them green before landing

**Resolved:** 2026-11-03 registry-driven close: git issue 88d0a42 (registry tip: 29f462126 Konstantin Fedotov Close issue)
