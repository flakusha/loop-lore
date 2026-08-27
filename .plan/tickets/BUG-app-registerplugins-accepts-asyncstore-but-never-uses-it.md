# BUG: app: registerPlugins accepts asyncStore but never uses it

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/app/register-plugins.ts lines 42-52: RegisterPluginsOpts declares asyncStore and callers pass it, but registerPlugins destructures only database and config, discarding asyncStore. Fix: use asyncStore (wire into middleware) or drop the option.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
