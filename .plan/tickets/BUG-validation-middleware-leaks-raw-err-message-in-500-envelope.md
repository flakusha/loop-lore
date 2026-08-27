# BUG: Validation middleware leaks raw err.message in 500 envelope

**Status:** ✅ Resolved (onValidationError sanitizes error output)
**Priority:** high

## Summary

src/validation/middleware.ts:103 — unknown-error branch returns raw err.message (SQL errors, file paths) to clients. Fix: generic 'Internal server error' body, log details server-side via logger.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
