<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: frontend !ok toast branches unreachable (feFetch throws on non-2xx)

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Two frontend modules have dead !ok branches because feFetch/safeFetch throws on all non-2xx responses: (1) src/frontend/pages/characters.ts selectCharacterCard — if (!resp.ok) error-toast branch unreachable; (2) src/frontend/alpine/chat-editing.ts saveEdit/removeMessage/handleAttach — !ok else-branches unreachable. Found by test-edge-case-strengthening worktree; tests pin actual behavior. Fix: remove dead branches or wrap feFetch in try/catch where toast UX is intended.

**Context:**

feFetch/safeFetch (src/frontend/fe-fetch.ts) throws on non-2xx, so `if (!resp.ok)` branches in the callers are unreachable. Decide per call site whether the toast UX should be kept (wrap the call) or the dead branch deleted. Covered by src/frontend/pages/characters.test.ts, src/frontend/alpine/chat-editing.test.ts.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
