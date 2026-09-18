<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Assistant Personality Drift Aux Advisory

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-character-multi-personality
**Tags:** assistant, personality, aux

**Summary:**
Auxiliary-LLM-driven drift detector that flags when the assistant is speaking out of the chosen personality voice.

**Context:**
`epic-aux-enrichment-pipeline` defines the `personality` enrichment task (table row exists, no consumers). Reuses that pipeline. After each assistant response, the AUX model scores 0-1 drift; >0.5 emits an advisory event visible to the GM.

**Acceptance Criteria:**
- Enable the existing `aux.personality` task in the default AUX config (`src/aux-pipeline/config.ts`).
- Add advisory writer (audit log + visible toast in the chat when active).
- Telemetry via shared runner (`callAux`); admin endpoint reads recent advisories.
- Threshold (0.5) configurable per chat.
- Tests: deliberately bad response triggers advisory; good response does not.
