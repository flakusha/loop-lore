<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Dedup invites redeem and auth form flows

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Approved quick-win batch (D5+D6, decision 2026-09-03). D5: chat/invites/redeem.ts vs chat/world-invites/redeem.ts near-exact clone (216 tokens / 23 lines) -> parameterize shared flow. D6: routes/auth/login.ts vs register.ts (315 tokens / 73 lines) -> shared submit/validate helper. Self-contained; no cross-session blockers.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
