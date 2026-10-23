<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Prompt template search and tags

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-prompt-templating

**Summary:**

Add a tags column on prompt_templates (new forward migration; append-only policy), a q filter over name/description/tags/model_family on the templates list route; visibility joins the layered tag authority (admin vocabulary → per-chat active subset → actor-trait layer) decided in the classifier epic.

**Context:**

There is no tags column or search on `prompt_templates` today. Phase 4 of `epic-image-prompt-templating`; visibility joins the layered tag-authority model decided in `epic-classifier-template-packs.md` (admin vocabulary → per-chat active subset → actor-trait layer).

**Acceptance Criteria:**

- [ ] `tags` column added to `prompt_templates` via a new forward migration (append-only migration policy)
- [ ] `q` filter over name/description/tags/model_family on the templates list route
- [ ] Visibility joins the layered tag authority (admin vocabulary → per-chat active subset → actor-trait layer)
- [ ] Migration and route filter tests passing
