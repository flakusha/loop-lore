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

## Review 2026-10-04

OPEN on dev - src/config/schema/sd-provider.ts:19-35 pickSdProvider returns a single provider ("fallback" here is selection fallback, not generation failover); src/generation/image-gen-route.ts:106, src/generation/image-edit-service/apply.ts:49 and src/generation/matting/factory.ts:30 all call pickSdProvider once with no ordered-candidate failover in the SD path; src/generation/providers/call-with-failover.ts implements failover for LLM providers only, never used for SD text2img. No worktree contains pickSdProviders/sdProviderCandidates/sdFallback or any SD-path failover.
