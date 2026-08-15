# TASK: Codemod fetch to apiFetch and JSON to safeJson utils

**Status**: done
**Priority**: low
**Labels**: code-quality, codemod, refactor
**Assignee**:
**Epic**: epic-code-quality
**Related**:

## Summary

Manual pass converting bare `fetch` calls to `apiFetch` and `JSON.*` usage to `safeJson*` utils.

## Status

Manual pass done (epic-code-quality status, "Manual pass done"). Ticket created retroactively — the pass was executed without a ticket file.

## Implementation

- `fetch` → `apiFetch` conversion across `src/`
- `JSON.stringify` / `JSON.parse` → `safeJsonStringify` / safe-parse utils where project rules require (`no-restricted-syntax`)

## Acceptance

- [x] Bare fetch calls converted to `apiFetch` where applicable
- [x] JSON usage migrated to `safeJson*` helpers
- [x] Lint rules (`no-restricted-syntax`) satisfied
