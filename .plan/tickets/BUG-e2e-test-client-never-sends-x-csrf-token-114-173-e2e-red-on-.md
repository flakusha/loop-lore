# BUG: e2e test client never sends X-CSRF-Token - 114/173 e2e red on dev

**Status:** ✅ Fixed (fix-review-quickwins; client wiring for ccac5b9d)
**Priority:** high
**Effort:** Medium

## Summary

tests/e2e/helpers/client.ts createClient sends Cookie: ll_token only; after ccac5b9d the CSRF middleware 403s every POST/PUT/PATCH/DELETE lacking x-csrf-token + csrf_token cookie pair. Confirmed: tests/e2e/flows/worlds.test.ts POST /api/worlds -> 403, cascading to ~114 failures across 26 files (dev @ 574dea7b+). Fix: client must capture csrf_token from the login/demo-login Set-Cookie and replay it as BOTH cookie and X-CSRF-Token header on unsafe requests. Blocks every e2e-gated worktree finalize until done. Found in dev-fix review 2026-09-01; companion to BUG-htmx-partials-403-after-csrf-hardening.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
