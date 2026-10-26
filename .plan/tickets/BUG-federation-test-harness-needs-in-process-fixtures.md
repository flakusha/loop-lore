<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Federation test harness needs in-process fixtures

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-federation-swarm-sync

## Summary

The federation epic Testing Strategy relies on local Mastodon or Lemmy or Fedify test instances; repo CI constraints make external-instance tests fragile. Mitigate with Fedify in-process test fixtures. Note: a prior low bug on hot-reload.test.ts skip was filed against a misread; that file now stubs node:fs.watch and exercises reload, so that bug is moot.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 9e5d529 (registry tip: 028003525 Konstantin Fedotov Close issue)
