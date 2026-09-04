<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-llm-assist

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium

## Summary

Production LLM-assist pass: replace the `runLlmAssist` stub with an aux-pipeline call that summarises recent chat context and emits `pending` growth entries. Off by default; enabled per character via `llm_assist_enabled`.

## Acceptance Criteria

- [ ] Pass produces non-trivial `pending` entries for `arc_stage_proposed` / `observation` / `trait_drifted` rows
- [ ] Static-mode pass is a no-op (returns `{ entryId: null }`)
- [ ] Aux-LLM call uses the same `aux-pipeline` resource as other systems
