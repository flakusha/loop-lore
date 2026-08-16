<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Multi-Session Support

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-multi-session

## Summary

Support multiple sessions for the same user. Enable concurrent access from different devices, session management, and session-aware features. From `epic-multi-session.md`.

## Scope

### Session Model

- Multiple sessions per user
- Session metadata (device, IP, last active)
- Session expiration

### Session Management

- List active sessions
- Revoke specific sessions
- Session switching

### Session-Aware Features

- Per-session preferences
- Session-specific state
- Cross-session sync

## Linked Epics

- `epic-multi-session.md`

## Acceptance Criteria

- [ ] Session model supports multiple sessions per user
- [ ] Session management API (list, revoke, switch)
- [ ] Session metadata tracking (device, IP, last active)
- [ ] Session expiration and cleanup
- [ ] Per-session preferences
- [ ] Session-specific state management
- [ ] Cross-session synchronization
- [ ] Unit tests for session logic
- [ ] Integration tests for multi-session workflow

## Notes

- Reference `epic-multi-session.md` for full system design
- Consider session limits per user
- Balance security vs. convenience
