<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: dual vn-choices route registration shadows guarded route

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

register-plugins.ts:182 mounts new checkChatAccess-guarded src/routes/chats/vn-choices.ts; :187 mounts legacy src/routes/vn-choices.ts (owner-only, {data} shape, 409 on re-select). Repo comment (112-113): later registrations shadow earlier. Runtime: legacy wins; guarded route + its IDOR fix dead; non-owner participants locked out. Fix: remove one registration, align guard to participant semantics, add a route-mount test asserting the live handler.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
