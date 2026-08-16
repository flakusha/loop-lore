<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG-2025-002: Client-side `ReferenceError: view is not defined` during characters flow

**Status**: open
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
