# BUG: Asset serve: public immutable cache + inline SVG exposure

**Status:** fixed-in-worktree
**Priority:** high
**Effort:** Medium

## Summary

serveFile (src/assets/controller/files.ts) returns every raw/download/compressed response with 'Cache-Control: public, max-age=31536000, immutable' including private and signed-URL responses — shared caches can replay private bytes after expiry. Executed probe: upload of image/svg+xml passes validateMimeType (prefix image/) and serves 200 inline as image/svg+xml with no nosniff/disposition -> stored XSS via signed raw URL. Fix: private/no-store (or TTL-capped private) for non-public assets; reject or force attachment for SVG/active types; add X-Content-Type-Options: nosniff.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


git issue: 4961df8
