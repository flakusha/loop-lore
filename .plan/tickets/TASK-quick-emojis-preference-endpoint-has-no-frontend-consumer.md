<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Quick Emojis preference endpoint has no frontend consumer

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** quick-emojis, frontend, wiring, preferences

**Summary:**

Backend route /api/v1/messages/quick-emojis (user-configurable quick-reaction list) has zero frontend callers: chat quick-reaction picker renders a hardcoded list (src/frontend/alpine/chat/lifecycle.ts:50 and inline-state.ts:129 default). Found during the 2026-10-04 FE-BE integration audit (see Audit section of epic-frontend-backend-integration.md). Scope: wire the picker's emoji list to the preference endpoint (load on init, persist on edit), keeping the hardcoded list as unauthenticated/default fallback.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
