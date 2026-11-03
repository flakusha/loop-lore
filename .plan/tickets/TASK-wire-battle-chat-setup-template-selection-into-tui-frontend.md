<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Wire battle chat-setup template selection into TUI frontend

**Status:** Done
**Status Note:** Partial in-flight work as uncommitted dev dirt (no branch): API layer sends templateId, picker UI step still missing — see Context.
**Epic:** epic-battle-ui
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Depends-on:** src/frontend/pages/new-chat/index.ts, submit.ts, state.ts (web reference, read-only)

**Summary:**

Battle chat-setup template selection exists in web; TUI lacks parity. Implement selection on world/chat creation.

**Context:**

Web parity reference: `src/frontend/pages/new-chat/index.ts:30-63` (template list load + `#chat-template` picker), `submit.ts:77,96,115` (templateId POST + renderingOverride), `state.ts:14-29` (ChatTemplateMeta). In-flight (uncommitted dev dirt, no branch): `src/tui/chat-create-api.ts:27-28,55` already sends templateId; `src/tui/chat-picker.ts:73-80` adds ChatSetupTemplate + CREATE_TEMPLATE_STATUS — but the create call site (`chat-picker.ts:376`) still passes name only and no template-fetch/pick step exists. Remaining work is the picker UI step + threading the selection through.

**Acceptance Criteria:**

- [ ] Chat-create flow fetches GET /api/v1/chat-setup-templates and offers a template step (Enter = use highlight, Esc = skip, per CREATE_TEMPLATE_STATUS)
- [ ] Picked template POSTed as `templateId`; blank chat omits the key (web parity)
- [ ] Tests: picker step in chat-picker.test.ts + templateId body on the create-api path

**Resolved:** 2026-11-03 registry-driven close: git issue ee92b3c (registry tip: 949b00613 Konstantin Fedotov Close issue)
