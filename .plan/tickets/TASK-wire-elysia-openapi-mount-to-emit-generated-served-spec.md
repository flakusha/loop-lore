# TASK: Wire @elysia/openapi mount to emit generated served spec

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-http-protocol-features

## Summary

@elysia/openapi is already a dependency but must be confirmed mounted in registerPlugins. When mounted it emits an OpenAPI spec derived from the existing Elysia plus TypeBox t route schemas, satisfying the automated-doc rule (generate from source, serve, never hand-maintain). References epic-api-openapi (which currently sketches a custom generator; prefer the dependency over a hand-rolled one). Acceptance: /api/openapi.json and a docs UI served from the generated spec; spec reflects current routes; no hand-maintained reference doc.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
