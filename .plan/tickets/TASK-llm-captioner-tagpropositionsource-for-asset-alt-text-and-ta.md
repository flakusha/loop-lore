<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: LLM captioner TagPropositionSource for asset alt-text and tag proposals

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

src/assets/service/tag-propositions.ts defines a pluggable TagPropositionSource but the only implementation tokenizes alt_text and filename. Add a source backed by the live captioning role (src/generation/caption-route.ts) that generates alt text for assets lacking one and feeds the existing proposeTags pipeline, giving the gallery model-driven auto-tagging with no new plumbing.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
