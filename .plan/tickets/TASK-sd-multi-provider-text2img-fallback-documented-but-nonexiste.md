<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: SD multi-provider text2img fallback documented but nonexistent

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The config schema documents multi-provider text2img fallback (src/config/schema/sd-provider.ts:19) but no fallback implementation exists in the generation path - documented behavior is unimplemented. Fix: implement provider fallback (ordered candidates, failover on generation error) or remove the schema documentation claim until it exists. Align with AGENTS.md project-overview mention of emotion-avatars multi-provider fallback.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
