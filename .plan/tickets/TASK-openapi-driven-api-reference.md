<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: OpenAPI-Driven API Reference

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-openapi-reference

## Summary

Auto-generate the API Reference from an OpenAPI spec derived from TypeScript route definitions. From `epic-openapi-reference.md`.

## Scope

### OpenAPI Spec Generation

- Extract from Elysia route definitions
- Generate JSON/YAML spec
- Include request/response schemas

### API Reference UI

- Interactive API explorer
- Try-it-out functionality
- Authentication support

### Documentation

- Auto-generated API docs
- Versioning support
- Deprecation notices

## Linked Epics

- `epic-openapi-reference.md`

## Acceptance Criteria

- [ ] OpenAPI spec generated from route definitions
- [ ] Spec includes all request/response schemas
- [ ] Interactive API explorer UI
- [ ] Try-it-out functionality
- [ ] Authentication support in explorer
- [ ] Auto-generated API documentation
- [ ] Versioning support
- [ ] Unit tests for spec generation
- [ ] Integration tests for API reference

## Notes

- Reference `epic-openapi-reference.md` for full system design
- Consider spec versioning and deprecation
- Balance detail vs. readability
