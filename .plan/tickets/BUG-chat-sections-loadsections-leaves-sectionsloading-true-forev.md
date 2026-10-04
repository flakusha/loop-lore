<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: chat-sections loadSections leaves _sectionsLoading=true forever on HTTP failure

**Status:** Done
**Status Note:** fixed on dev (commit 255ddb81e, "clear _sectionsLoading via finally in loadSections") — `loadSections` clears `_sectionsLoading` in a `finally` block, so the `!res.ok` early return no longer leaves the flag set. Pinned by two tests in `src/frontend/alpine/chat-sections.test.ts`: "clears the loading flag on non-ok response" and "clears the loading flag when fetch throws". Verified 2026-10-04.
**Priority:** medium
**Effort:** Medium

**Summary:**

src/frontend/alpine/chat-sections.ts: the !ok path in loadSections returns from inside the try block, skipping the _sectionsLoading = false cleanup — loading flag stays true forever after a failed load (UI stuck in loading state). Found by test-edge-case-strengthening worktree (FrontendAlpine1 agent); test pinned with comment. Fix: use finally block or set flag before return.

**Context:**

Alpine store in src/frontend/alpine/chat-sections.ts; the failure path is exercised by src/frontend/alpine/chat-sections.test.ts. Fix must keep the existing success-path behaviour and the _sectionsLoading guard semantics for concurrent loads.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
