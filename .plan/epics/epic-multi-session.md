# EPIC: Multi-Session Support

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Type:** Feature Epic

## Summary

Support multiple sessions for the same user. Enable concurrent access from different devices, session management, and session-aware features.

## Scope

- Multiple concurrent sessions per user
- Session management (list, revoke, expire)
- Session-aware features (per-session preferences)
- Device tracking
- Session security (IP binding, user agent)

## Tasks

- [ ] Session model update (multiple per user)
- [ ] Session management API
- [ ] Session listing UI
- [ ] Session revocation
- [ ] Session expiry configuration
- [ ] Device tracking

## Files

- `src/db/schema-sessions.ts` — session schema
- `src/routes/sessions.ts` — session management API
- `src/frontend/alpine/settings.ts` — session management UI

## Linked Tasks

- TASK-multi-session.md
