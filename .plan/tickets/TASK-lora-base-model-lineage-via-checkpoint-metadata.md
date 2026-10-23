<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: LoRA base-model lineage via checkpoint metadata

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-lora-discovery-application
**Tags:** lora, metadata, lineage

**Summary:**

Record and expose LoRA -> base-model lineage: read trainer-embedded metadata (ss_network_module / ss_base_model_version / modelspec fields) and tensor-key classification from epic-model-metadata-read, then match LoRAs to compatible checkpoints and gate application in existing LoRA flows.

Reference: Stability Matrix SafetensorMetadata.cs ss_*/modelspec.* fields + GenerationParameters derivation; ComfyUI comfy/model_detection.py; loop-lore src/plan/epics/epic-lora-discovery-application.md existing sd.cpp prompt-injection + ComfyUI LoraLoader flows.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
