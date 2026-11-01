<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Swipe Preference-Pair Capture (DPO Groundwork)

**Effort:** Small
**Type:** epic
**Tags:** training, dpo, preferences, swipes, datasets
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Epic-lite: capture swipe/regenerate chosen-vs-rejected pairs as DPO groundwork. The DPO export is specified (`buildDPO` from reactions/model_comparisons, `64d38ce`), but those are sparse signals; the dense one the product already produces is swiping: `swipe_index` (`schema-core.ts:809`) + `parent_id` (:787) + `generation_attempts` (model_id, repetition_score) identify kept-vs-discarded sibling completions — natural chosen/rejected pairs with quality telemetry, currently captured by nothing. Coverage check: `giwt search swipe` → 23 hits, races/UX/mobile only; `b619680` is regenerate/retry UX, not data capture (2026-11-01).

## Scope

- Pair extraction over swiped/regenerated assistant messages with full provenance.
- Quality gates using generation-attempt telemetry.
- Emit rows in `buildDPO`'s input schema so the existing export consumes them.

## Related Epics

- `epic-training-finetune-datasets.md` — owns the `buildDPO` export layer (`64d38ce`).

## Tickets

- `TASK-swipe-preference-pair-extraction-dpo-groundwork` (`6d11244`, Medium) — extractor + quality gates + provenance.

## Open Questions

None blocking from the research doc. (Running DPO *training* jobs is an explicit non-goal — export pairs only until the SFT lane is validated.)
