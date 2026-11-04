<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: frontend bucket: card studio, download center, dataset queue, eval dashboard, quota modal, group-chat viewer

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-frontend-admin
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Combined UI ticket from .tmp/research/external-brains/09-frontend-bucket.md — backend refs exist, UI missing. Menus: character-card studio (v2 import/export+lint, CardEditor-pattern), download-center (ONNX/GGUF catalog+progress, Manager-pattern), dataset queue (label/grade, Argilla-pattern), eval dashboard (RAGAS/OpenEvals scores). Modals: quota/usage spend-caps display (quota-engine shipped, wiring only), consent grant/deny (needs TASK-nsfw-consent-grant-route-missing), moderation triage (needs TASK-moderation-report-endpoint). Logic: group-chat viewer htmx+Alpine rendering (TASK-group-chat-frontend-viewer exists — this wires it), expression auto-switch (sentiment to sprite), chat FTS highlight (needs BUG-chat-fts-encrypt-mismatch first). Journeys served: creator onboarding, moderation loop, finetune loop, local-inference setup. Skipped (backend missing too): lorebook panel, VN scene-graph, timeline branches, backup browser, revision history — file when their epics land.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
