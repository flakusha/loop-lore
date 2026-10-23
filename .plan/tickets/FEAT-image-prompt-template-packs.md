<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Image prompt template packs

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-image-prompt-templating

**Summary:**

Multi-file domain configs/templates/image-prompts/*.yaml seeded into prompt_templates (workflow-seed pattern via boot seeding); classifier-pack envelope (serves/tags/when/priority/labels); selection function + dispatch on emotion-avatar generation (fallback to current inline assembly when nothing matches) and the image-gen route; worked example: emotion-avatar natural-prose template for NL-encoder families; optional runtime importers: `__name__`-style wildcard libraries (nesting resolved at import time) and MOSS-style character/style catalog JSON (prompt-text only, content never bundled — upstream NOTICE does not grant third-party character rights); ship example pack YAML alongside the existing configs/templates/*.example.yaml files.

**Context:**

Emotion-avatar prompt assembly is family-blind tag concatenation today. This is Phase 3 of `epic-image-prompt-templating`, reusing the classifier-pack envelope, selection precedence, and layered tag authority from `epic-classifier-template-packs.md`. Resolve TASK-resolve-dormant-emotionentry-prompt-field before layering more avatar template fields here.

**Related:** FEAT-image-template-variables-with-variance-expansion (pack templates carry variables/variance consumed at selection time); TASK-resolve-dormant-emotionentry-prompt-field (field resolution precedes pack avatar fields)

**Acceptance Criteria:**

- [ ] Multi-file domain `configs/templates/image-prompts/*.yaml` seeded into `prompt_templates` rows (workflow-seed pattern via boot seeding)
- [ ] Pack entries use the classifier-pack envelope (`serves`/`tags`/`when`/`priority`/`labels`)
- [ ] Selection function dispatches on emotion-avatar generation with fallback to current inline assembly when nothing matches
- [ ] Selection function dispatches on the image-gen route
- [ ] Worked example: emotion-avatar natural-prose template for NL-encoder families
- [ ] Optional runtime importers: `__name__`-style wildcard libraries (nesting resolved at import time) and MOSS-style character/style catalog JSON (prompt-text only, content never bundled — upstream NOTICE does not grant third-party character rights)
- [ ] Example pack YAML shipped alongside the existing `configs/templates/*.example.yaml` files
- [ ] Tests cover seeding, selection precedence, fallback, and importers
