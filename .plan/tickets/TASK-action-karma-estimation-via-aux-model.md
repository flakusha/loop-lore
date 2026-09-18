<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Action Karma Estimation Via AUX Model

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-aux-enrichment-pipeline
**Tags:** aux, karma, enrichment

**Summary:**
Enable the AUX LLM enrichment task `karma` that scores user/character actions for karma deltas in fast (~2s) pre-generation.

**Context:**
`epic-aux-enrichment-pipeline` lists no karma task yet; this ticket adds `karma` to the shared runner alongside the other 8 tasks, returning `{ karmaDelta: number, axis: string, reason: string }`.

**Acceptance Criteria:**
- Add `karma` to `EnrichmentTask` enum and to the ENRICHMENT_PROMPTS map with a focused prompt.
- Register in `AuxEnrichmentConfig.enabled` default (off by default; admin-toggled per world).
- Wire call into `src/auto-gen.ts` parallel hook (off main path; non-blocking).
- Telemetry: `aux.call` event with `task: "karma"`, latency, token usage.
- Tests: AUX call returns deterministic shape; failure produces null (graceful degrade).
