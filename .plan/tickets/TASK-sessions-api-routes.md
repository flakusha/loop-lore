<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Sessions API Routes

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-multi-session

## Summary

Sessions API routes: list, create, delete, switch sessions. From `docs/spec/users-sessions.md`. From `epic-multi-session.md`.

## Scope

### API Endpoints

- `GET /api/sessions` — list user sessions
- `POST /api/sessions` — create new session
- `DELETE /api/sessions/:id` — revoke session
- `POST /api/sessions/:id/switch` — switch active session

### Session Management

- Session creation with device/IP tracking
- Session revocation and cleanup
- Session switching with state transfer

## Linked Epics

- `epic-multi-session.md`

## Acceptance Criteria

- [ ] `GET /api/sessions` returns list of user sessions
- [ ] `POST /api/sessions` creates new session with metadata
- [ ] `DELETE /api/sessions/:id` revokes specific session
- [ ] `POST /api/sessions/:id/switch` switches active session
- [ ] Session metadata includes device, IP, last active
- [ ] Session expiration and cleanup
- [ ] Unit tests for session routes
- [ ] Integration tests for session management

## Notes

- Reference `docs/spec/users-sessions.md` for API spec
- Follow existing route patterns in `src/routes/`
- Add response schemas per `TASK-add-response-schemas-remaining-routes.md`
