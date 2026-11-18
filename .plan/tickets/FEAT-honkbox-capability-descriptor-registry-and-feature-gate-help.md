<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: honkbox capability descriptor registry and feature gate helper

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-platform-integrations.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Honkbox now serves the capabilities contract and an OpenAI-compatible chat completions shim. Add one loop-lore probe, cache and feature-gate helper so the live contract can gate UI and dispatch without a new provider family.

**Evidence (dev 2026-11-18):** honkbox FEAT-capabilities-api landed (f44b3fc) and the shim landed (2eca89e); routes live at honkbox crates/server/src/routes.rs:357,367. Existing loop-lore ticket TASK-consume-honkbox-capabilities-contract.md is Not Started but still claims BLOCKED. Probe pattern exists at src/generation/image-engine/sdcpp-discovery.ts:22,89-97.

**Premise corrections:** baseUrl already includes /v1 (packages/core/src/config/schema/providers.ts:24-25; openai-compatible/core.ts:31,75), so the probe must GET {baseUrl}/capabilities, never {baseUrl}/v1/capabilities. Target the landed Capabilities shape (api_version, server, features, formats, auth, queue, optional tools/image_ops, openapi, models), not an id/enabled array.

**Scope:** add src/integrations/honkbox/capabilities.ts with probe, defensive parse, cache keyed by baseUrl plus credential fingerprint, refresh action, and feature-gate helper. Wire one call into provider setup beside sdcpp-discovery. No route probing, no new provider family, contract mismatch warns without breaking boot.

**Acceptance Criteria:**

- [ ] probe URL asserted as {baseUrl}/capabilities
- [ ] parser mirrors landed Capabilities shape; unknown major api_version warns and degrades
- [ ] one probe per setup/refresh; cache path covered by test
- [ ] feature-gate helper returns false when flag absent
- [ ] stale BLOCKED line removed from TASK-consume-honkbox-capabilities-contract.md
- [ ] targeted tests pass

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
