<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: content decompression stage in generation pipeline

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/content/compress.ts (exists but unused)

**What**: Not invoked pre-LLM — wire decompression before regex stage.

**Fix**: Wire content decompression into the generation pipeline before the regex transform stage.

**Source**: FEAT-013 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
