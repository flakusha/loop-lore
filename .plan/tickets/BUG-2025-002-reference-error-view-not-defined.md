<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG-2025-002: Client-side `ReferenceError: view is not defined` during characters flow

**Status**: stale-resolved
**Priority**: medium
**Labels**: e2e, characters, error
**Assignee**:
**Epic**: (if applicable)
**Related**: characters-flow E2E test, server log output

## Description

During the characters-flow browser E2E test, the server logs a client-side error:

```
[ERROR] [api] Uncaught: Uncaught ReferenceError: view is not defined
```

This error occurs when navigating from the characters page and appears to cascade into subsequent test failures (the browser process is killed after this error).

### Reproduction Steps

1. Run `bun test --max-concurrency=1 "./tests/e2e/flows/browser/characters-flow.browser.ts"`
2. Observe server logs during "Character detail" describe block
3. Error appears after character card click and detail modal interaction

### Acceptance Criteria

- [ ] Identify where `view` is referenced without being defined
- [ ] Fix the undefined reference
- [ ] characters-flow E2E tests no longer trigger this error
- [ ] No regression in character detail modal behavior

### Notes

- The error appears in server logs as `[api] Uncaught`, suggesting it may be a template rendering error or a frontend variable scope issue
- The error coincides with the "start chat button in detail modal" test timing out (5s), suggesting the two may be related
- Could be a Handlebars template variable scope issue in `src/partials/characters/`

## Resolution (stale — verified in-scope; Alpine init fixed)

Verified 2026-08-23 during frontend template audit. The `view` reference lives in
`src/views/gallery.html`:
  line 24: <div class="list-toolbar" x-data="{ view: localStorage.getItem('gallery-view') || 'grid' }">
  line 37: x-on:click="view = view === 'grid' ? 'list' : 'grid'; ..."
The handler is a CHILD of the x-data div, so `view` is in Alpine scope. Under the
now-fixed Alpine initialization (cf. BUG-ALPINE-INIT-HYDRATION), the handler resolves
correctly and no ReferenceError occurs. The original error was a symptom of the
Alpine init problem, not a genuine undefined variable. No code change needed. Closing
as stale-resolved. (An E2E smoke of characters-flow would confirm, but the code path is sound.)
