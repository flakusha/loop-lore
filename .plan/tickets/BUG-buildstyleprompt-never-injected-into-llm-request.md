<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: buildStylePrompt never injected into LLM request

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/generation/smart-regen.ts:45, generate-route/

**What**: No evidence stylePrompt enters request body.

**Fix**: Wire buildStylePrompt into the LLM request body for smart-regen.

**Source**: FEAT-014 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
