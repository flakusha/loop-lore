<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: frontend !ok toast branches unreachable (feFetch throws on non-2xx)

**Status:** Done
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

## Resolution

Verified fixed by code reading and focused tests against dev:

- `feFetch` rejects every non-2xx response by throwing, so the dead `!resp.ok` branches in `src/frontend/pages/characters.ts` and `src/frontend/alpine/chat-editing.ts` were removed.
- The error-handling paths in those callers now branch on `error.status` from the thrown error, which is the only reachable code path.
- Pinned by `src/frontend/alpine/chat-editing.test.ts`, which exercises the affected handlers and asserts the correct error branch is taken for non-2xx responses.
