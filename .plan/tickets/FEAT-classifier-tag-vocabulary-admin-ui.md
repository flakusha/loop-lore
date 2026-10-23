<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: classifier tag vocabulary admin UI

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** classifier-template-packs
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Admin-panel curation UI for the classifier tag vocabulary plus a
per-chat active tag-subset picker. Missing UI half of the decided
layered tag authority (shipped on branch
`feat-classifier-template-packs`): (a) vocabulary editor card in the
admin panel — list/add/remove/rename tags with validation (non-empty,
unique, reasonable length); (b) per-chat active-subset picker in the
chat settings modal, restricted to vocabulary entries.

**Context:**

Layered tag authority is DECIDED and shipped on branch
`feat-classifier-template-packs`: admin-curated vocabulary stored in
system_config key `classifier_tag_vocabulary` (JSON `string[]`,
admin-writable via the generic `PATCH /admin/system-config`), per-chat
active subset in `classifier_tags_active:<chatId>` keys, read-only
automatic actor-trait context tags with layer-provenance logging. The
missing piece is UI only. Caveats: TOCTOU — none (config keys);
authorization — `admin.system` for the vocabulary card, chat-settings
gate for the per-chat subset picker; rollback — revert commit; schema —
no touchpoints. Do not re-litigate or resolve design beyond this scope.

**Acceptance Criteria:**

- [ ] Vocabulary editor card renders in the admin panel and persists
      via `PATCH /admin/system-config` (`classifier_tag_vocabulary`)
- [ ] Per-chat active-subset picker in chat settings enforces
      vocabulary membership
- [ ] i18n keys added ×10 locales
- [ ] Unit tests for the two endpoints/contract pins
