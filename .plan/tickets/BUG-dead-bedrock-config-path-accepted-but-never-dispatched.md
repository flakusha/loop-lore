<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Dead Bedrock config path accepted but never dispatched

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] NOT-FIXED (issue 3edc50d): Verified: no BedrockProvider class exists in src; initializeProviders (src/generation/providers/registry.ts:243-292) has no bedrock branch; schema still declares bedrock config (src/config/schema providers.ts:115); provider-instances.ts:74-76 now returns a name-only stub instance, so the dead path resolves by name while remaining undispatchable — neither implemented nor rejected.
**Priority:** high
**Effort:** Medium
**Epic:** epic-provider-plugin-ecosystem
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

bedrock?: BedrockProviderConfig exists (providers.ts:119-140), type union lists bedrock, but no BedrockProvider class and initializeProviders never constructs it. Config silently ignored. Fix: implement + wire, or reject bedrock at config load.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 3edc50d (registry tip: b465ae053 Konstantin Fedotov Close issue)
