# BUG: Federation test harness needs in-process fixtures

**Status:** not-yet-implemented
**Priority:** low
**Effort:** Medium

## Summary

The federation epic Testing Strategy relies on local Mastodon or Lemmy or Fedify test instances; repo CI constraints make external-instance tests fragile. Mitigate with Fedify in-process test fixtures. Note: a prior low bug on hot-reload.test.ts skip was filed against a misread; that file now stubs node:fs.watch and exercises reload, so that bug is moot.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
