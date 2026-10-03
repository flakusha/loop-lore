<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# IDEA: Relevance-classified proactive messaging triggers

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Proactive outreach is interval plus quiet-hours plus backoff (src/chat/proactive/timing.ts). Classify whether pending conversation state warrants outreach (novelty or relevance) before sending, using the AUX pipeline with graceful skip on failure.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
