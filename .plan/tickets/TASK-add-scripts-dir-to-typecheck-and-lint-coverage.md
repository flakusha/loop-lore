# TASK: Add scripts/ dir to typecheck and lint coverage

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

tsconfig.backend.json includes only src/**/*; scripts/ is typechecked by neither tsgo nor tsc, and eslint flat config ignores it (only oxlint sees it). Latent errors surface ad hoc (example: dead binding in sync-ticket lib found 2026-08-25 via scoped strict-tsc). Fix: add a tsconfig.scripts.json (or extend backend include) plus eslint config match for scripts/, wire into check:parallel gate.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
