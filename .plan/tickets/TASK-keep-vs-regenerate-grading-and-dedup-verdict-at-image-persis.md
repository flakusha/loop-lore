<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Keep-vs-regenerate grading and dedup verdict at image persist time

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

persistGeneratedImages hardcodes dedupe false and stores caller alt text verbatim; no classifier opinion is recorded. Add a post-generation step that enables perceptual dedup and records a structured quality or keep verdict (captioner or classifier role) on the asset row so the UI can suggest keep-vs-discard. No auto-delete; flag defaults off. Research note: MLLM image-quality work favors regressing a score alongside text over bare classification (AAAI regression-over-classification).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
