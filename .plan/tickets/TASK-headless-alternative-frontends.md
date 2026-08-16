<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Headless Mode & Alternative Frontends

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-headless-alternative-frontends

## Summary

Headless mode, alternative frontend solutions, OpenAPI spec, WebSocket/WebTransport support. Enable non-browser clients and alternative UIs. From `epic-headless-alternative-frontends.md`.

## Scope

### Headless API Mode

- No frontend serving
- API-only operation
- Configuration flag

### Alternative Frontends

- Fresh.js (Deno-native)
- React/Vue wrappers
- Mobile apps

### SDK/Client Library

- Shared vs. framework-specific layers
- TypeScript client library
- API versioning

## Linked Epics

- `epic-headless-alternative-frontends.md`

## Acceptance Criteria

- [ ] Headless mode configuration (skip frontend middleware)
- [ ] OpenAPI spec generation from Elysia routes
- [ ] API versioning (`/api/v1/`, `/api/v2/`)
- [ ] WebSocket endpoint support
- [ ] Fresh.js proof-of-concept
- [ ] TypeScript client library
- [ ] Unit tests for headless mode
- [ ] Integration tests for API-only operation

## Notes

- Reference `epic-headless-alternative-frontends.md` for full system design
- Fresh.js is first concrete alternative frontend
- Consider SDK publishing strategy
