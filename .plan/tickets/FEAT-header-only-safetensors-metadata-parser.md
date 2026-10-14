<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Header-only safetensors metadata parser

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** model-metadata-read
**Tags:** models, metadata, safetensors

**Summary:**

Parse safetensors headers without loading weights: read the 8-byte little-endian u64 header length (sanity cap ~100MB), JSON-parse the header prefix, expose the top-level `__metadata__` string map and tensor name/dtype/shape entries. Server-side (Bun/TS) for the model index; 100MB cap guards absurd headers.

Reference: ComfyUI comfy/utils.py safetensors_header; stable-diffusion.cpp src/model_io/safetensors_io.{h,cpp} read_safetensors_file (metadata_map) + read_safetensors_index_file (sharded weight_map); Stability Matrix StabilityMatrix.Core/Models/SafetensorMetadata.cs ParseAsync (Utf8JsonReader header-only).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
