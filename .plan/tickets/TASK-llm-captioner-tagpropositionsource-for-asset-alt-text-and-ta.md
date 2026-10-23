<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: LLM captioner TagPropositionSource for asset alt-text and tag proposals

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities

**Summary:**

src/assets/service/tag-propositions.ts defines a pluggable TagPropositionSource but the only implementation tokenizes alt_text and filename. Add a source backed by the live captioning role (src/generation/caption-route.ts) that generates alt text for assets lacking one and feeds the existing proposeTags pipeline, giving the gallery model-driven auto-tagging with no new plumbing.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
