<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Human/hybrid GM-config authoring (D3)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Problem: the story-domain GameMasterConfig (src/story/story-types.ts:16-36, GameMasterType llm/human/hybrid from src/db/enums-config) is machine-derived only. The auto-gen path synthesizes it from the chat gm_config blob (src/generation/auto-gen/story-mode.ts:41-63 defaults type to Llm and copies llmConfig/actorModels/humanGM/escalationThreshold verbatim), and the chat-settings panel (src/frontend/alpine/chat-settings/gm-config.ts readGmSettings/buildGmConfig, fields gmType/gmHumanActorId/gmModel/gmProvider/gmTemperature/gmMaxTokens at :34-40) exposes flat fields but no authoring story: operators cannot author a GM config by hand, override the generated one, or blend human + generated input. epic-config-templates.md:383-384 still records gmConfig human/hybrid as unreachable from UI; backlog priority-p0-p2.md P2-C details line 85 lists "Open: GM config type authoring (human/hybrid)". Owning epic: .plan/epics/epic-assistant-gm-flows.md (GmConfig shape gap closed there at line 39, authoring semantics still open). This ticket carries the DESIGN: modes human-authored / hybrid / generated, precedence rules between hand-authored and generated config, validation of hand-authored config against the existing GameMasterConfig shape, UI entry point in the existing chat-settings gm-config panel. Acceptance: (1) mode semantics designed + documented in the owning epic or docs/spec; (2) implementation ticket(s) spawned, or this ticket scoped to include implementation; (3) hand-authored config validates against the existing gm-config schema (GameMasterConfig shape) before activation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
