<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Training / Finetune + Dataset Curation

**Effort:** Large
**Type:** epic
**Tags:** training, finetune, datasets, lora, registry, licensing
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** High

## Summary

Training data loop for loop-lore: where training sets come from (asset/caption export), where training runs (external trainers via job seam vs local), and how trained models link back into the model registry. Closes the discovery→training gap owned by `epic-lora-discovery-application.md` and feeds the RSI dataset loop in `epic-recursive-self-improvement.md`.

## Scope

- Training-ready export fields: image + caption + prompt + model + LoRA + license; gap analysis of which fields exist in asset metadata today vs missing.
- Captioning pass: what `caption-route.ts` produces today and whether it is consistent enough for dataset captions or a prerequisite pass is needed.
- External trainer job seam: Kohya / OneTrainer API shape; minimal submission interface (API/workflow) and model-registry tracking (dataset hash → model link).
- License-safe filtering/dedup: content-hash + quality score + lineage gates before any export leaves the system.
- Smallest shippable slice: gallery multi-select → export ZIP/JSONL.

## Related Epics

- `epic-lora-discovery-application.md` — discovery→training gap (bridge owner)
- `epic-asset-lineage-provenance.md` — license-safe curation + provenance
- `epic-rag-assets-unified-storage-and-assistant-flows.md` — decomposition as dataset source
- `epic-recursive-self-improvement.md` — RSI dataset feed consumer

## Tickets

_TBD — create implementation tickets._
