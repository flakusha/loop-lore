<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: callAux graceful failure throws on empty config

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

resolveModelRole crashes (runner.ts:65) before null-check; expected graceful null; actual exception.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
