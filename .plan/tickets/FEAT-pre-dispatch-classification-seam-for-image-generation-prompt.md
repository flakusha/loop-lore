<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Pre-dispatch classification seam for image generation prompts

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The image path (generate-route to persistGeneratedImages) has no prompt classification. Add a config-gated pre-dispatch hook running the nsfw and injection-check AUX tasks over the image prompt when the chat or actor is SFW-gated, blocking before image-gen compute is spent; failure is non-blocking with telemetry task image-nsfw-check. Mirrors the pre-LLM gate in content-hooks.ts checkNsfwEligibility.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
