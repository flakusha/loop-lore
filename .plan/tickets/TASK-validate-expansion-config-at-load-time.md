<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Validate expansion config at load time

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)

**Summary:**

runTemplateExpansion (src/config/template-expansion/run.ts:33) never calls validateExpansionConfig (run.ts:111), which is exported and tested (template-expansion.test.ts:524) but has zero production callers. A typo in expansion.yaml intentPatterns[].emotion (e.g. 'determind') therefore merges silently — expand.ts:48-60 only dedups (pattern, emotion) pairs. The downstream pipeline is currently inert (detectAvatarChangeIntent has no production caller; see src/generation/auto-gen/prepare-generation.ts:13-17), so this ticket is about making the malformed config visible at load rather than about repairing runtime behaviour. Fix: invoke validateExpansionConfig in loadConfig (src/config/load/load.ts:134), push the returned strings into expansionResult.errors, and log them at warn. Evidence: .plan/configs-templates-wiring-audit.md §2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
