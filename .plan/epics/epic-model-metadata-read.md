<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Model Metadata Read (Headers, Hashing, Classification)

**Overview:** (see sections below)


**Status:** Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** models, metadata, safetensors, gguf, hashing, blake3, classification, dedup

## Summary

Read model identity and capabilities from the files themselves, without loading weights: header-only safetensors parsing (8-byte u64 header length + JSON, `__metadata__` map), a GGUF typed KV reader extending the existing frontend header-count probe (`src/frontend/alpine/gguf-probe.ts`) to real KV extraction with an arch-templated key registry, a tensor-key-prefix classifier (checkpoint/lora/vae/text-encoder across SD/Flux/Wan/HiDream/Z-Image), a weight-sniffing fallback when metadata is absent, HF-id → display-name heuristics, streamed blake3/sha256 hashing with cross-model dedup, and a `.cm-info.json`-style sidecar cache feeding a hash → local-db → remote lookup cascade. Feeds `epic-local-model-file-discovery.md` (scan) and `epic-model-info-frontend.md` (display).

Reference implementations: ComfyUI `comfy/utils.py:safetensors_header`; stable-diffusion.cpp `src/model_io/safetensors_io.{h,cpp}` + `XxxConfig::detect_from_weights` (`src/model/diffusion/{flux,wan,z_image}.hpp`); llama.cpp `gguf-py/gguf/{gguf_reader,constants,metadata}.py` (ReaderField KV API, `Keys.General.*`/`Keys.LLM.*` templating, `get_model_id_components`); Stability Matrix `SafetensorMetadata.cs:ParseAsync`, `SafetensorClassifier.cs:ClassifyAsync`, `FileHash.cs` (GetBlake3MemoryMappedParallel), `MetadataImportService.cs:ScanDirectoryForMissingInfo`, `Helper/ModelFinder.cs`.

## Scope

- Safetensors header-only parser (no weight load; 100MB header sanity cap).
- GGUF KV typed reader + key registry (`{arch}.context_length` style templating).
- Tensor-key-prefix classifier → Checkpoint/Lora/Vae/TextEncoder/Unknown.
- Weight-shape fallback inference when header has no usable metadata.
- HF `<org>/<name>` id heuristics → display name/version/size fields.
- Streamed blake3 (parallel/memory-mapped) + sha256 (compat) hashing; dedup by hash.
- Sidecar metadata cache next to each model file; skip-if-present incremental rescan; lookup cascade hash → local DB → remote API.

Out of scope: frontend cards/tags (`epic-model-info-frontend.md`), remote download management, LoRA application (`epic-lora-discovery-application.md`).

## Related tickets

- `FEAT-header-only-safetensors-metadata-parser.md`
- `FEAT-gguf-kv-typed-reader-with-arch-templated-key-registry.md`
- `FEAT-tensor-key-prefix-model-classifier.md`
- `TASK-model-weight-sniffing-fallback-detect-from-weights.md`
- `TASK-hf-id-to-display-name-heuristics.md`
- `FEAT-model-hash-blake3-and-sha256-with-cross-model-dedup.md`
- `TASK-model-metadata-sidecar-cache-and-hash-lookup-cascade.md`

## Acceptance Criteria

- [ ] Safetensors and GGUF headers parsed without loading weight data; `__metadata__` / KVs exposed typed
- [ ] Every discovered model file classified (checkpoint/lora/vae/text-encoder) with a weight-sniffing fallback
- [ ] Model files hashed (blake3 + sha256) with duplicate detection across categories
- [ ] Sidecar cache makes rescans incremental; unknown hashes resolve via the lookup cascade


git issue: 51f7108
