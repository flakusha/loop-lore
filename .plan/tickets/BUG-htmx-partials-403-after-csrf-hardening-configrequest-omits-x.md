# BUG: htmx partials 403 after CSRF hardening - configRequest omits X-CSRF-Token

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Commit ccac5b9d made double-submit require BOTH x-csrf-token header and csrf_token cookie (correct fix for BUG-csrf-verification-accepts-cookie-only-token). But src/frontend/alpine/htmx.ts:45-51 htmx:configRequest injects only Authorization Bearer - no X-CSRF-Token. The pre-fix fallback (headerToken ?? cookieToken) masked this; now four non-exempt htmx write sites 403: src/partials/characters/create-modal.html:17 POST /api/actors, src/partials/characters/import-modal.html:17 POST /api/actors/import, src/partials/gallery/upload-modal.html:17 POST /api/assets, src/partials/worlds/edit-modal.html:17 PUT /api/worlds/:id. Alpine/feFetch/safeFetch paths are fine (buildAuthHeaders injects the header). Fix: read csrf_token from document.cookie in htmx:configRequest and set X-CSRF-Token (mirror feFetch getCsrfToken). Found in dev-fix review 2026-09-01.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
