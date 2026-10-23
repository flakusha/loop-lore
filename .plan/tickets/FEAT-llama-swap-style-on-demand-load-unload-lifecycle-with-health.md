<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Llama-swap style on-demand load unload lifecycle with health gating

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-llama-swap
**Tags:** models, lifecycle, llama-swap

**Summary:**

Model lifecycle behind llama-swap semantics: spawn the upstream process on first request, unload the previous model on swap (group swap/exclusive/persistent modes), TTL-based auto-unload, startup preload hooks, and health-gating (upstream considered ready only after its check-endpoint probe passes; requests queue until healthy).

Reference: llama-swap internal/config/model_config.go (per-model cmd/ttl/check-endpoint), group swap semantics in internal/config/config.go, HookOnStartup{Preload,Profile}; llama.cpp tools/server/server-models.cpp state machine; existing loop-lore spawn code src/services/server-external-manager/ + src/services/sd-discovery.ts.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
