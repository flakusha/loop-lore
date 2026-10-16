<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: AssetView loads assets without auth

**Status:** Done
**Priority:** critical
**Effort:** Medium
**Epic:** epic-terminal-ui

**Summary:** `AssetView.setChatId()` loaded linked assets via `/api/v1/assets` without forwarding the session token, causing 401 responses for authenticated asset endpoints.

**Context:** `AssetView` was constructed without the `sessionToken` needed to authenticate asset requests. The asset API requires a valid session token.

**Fix:** `config.tui.sessionToken` is now threaded into `AssetView` at construction time via `src/tui/app.ts`. `AssetView` passes the token on every asset fetch.

**Resolution:** Fixed by `3cdc0cd0a` — session token threaded into `AssetView` at construction. `src/tui/asset-view.test.ts` added to cover the auth behavior.

**Acceptance Criteria:**

- [x] `config.tui.sessionToken` is threaded into `AssetView` at construction
- [x] Asset fetches include the session token in the Authorization header
- [x] Tests cover the auth path

**git issue:** 79e5174
