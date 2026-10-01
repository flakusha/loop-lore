<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Tests delete app-installed globals, breaking every later test file

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Five frontend test files `delete` globals that production code installs at import time, instead of restoring the load-time value. A later test file in the same process then reads `undefined`.

Affected globals and their production installer:
- `__DOMPurify` / `__marked` — src/frontend/chat-vendor.ts
- `__localeStrings` — src/frontend/ui.ts, src/frontend/alpine/app.ts, src/routes/views/layout.ts
- `__THEMES` — src/frontend/alpine/theme.ts
- `loadNewChatPage` — src/frontend/pages/new-chat/index.ts
- `__previewAsset` — src/frontend/asset-preview.ts, src/frontend/alpine/chat-utils/gallery.ts

Affected teardowns:
- src/frontend/alpine/chat-utils/render.test.ts:50-51 (clearMarkdownLibs)
- src/frontend/alpine/composer-pre-send.test.ts:423 (clearPreviewSanitizer)
- src/frontend/ui.test.ts:251-252 (beforeEach)
- src/frontend/alpine/htmx.test.ts:465,476
- src/frontend/alpine/chat-utils/gallery.test.ts:423

Note the delete is load-bearing in some of these: render.test.ts and composer-pre-send.test.ts use it as a precondition to assert the fail-safe path when the libs are absent. The fix snapshots the load-time value and restores it in afterEach/afterAll rather than removing the delete.

`-D` is not a sufficient guard: a sibling test that does not itself import the vendor module still observes `undefined`. Verified with a two-file probe. src/frontend/app-globals.test.ts now fails any test file that deletes one of these globals without also restoring it.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
