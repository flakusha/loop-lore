<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GGUF split-chunk manifest contract

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Labels:** byok, local-models, wasm, gguf, browser
**Epic:** epic-byok-local-models.md
**Related:** FEAT-byok-local-models.md, TASK-wllama-gguf-inference-engine-browser.md

## Summary

wllama cannot load files over the ~2GB ArrayBuffer cap, so large GGUF models
must ship as `llama-gguf-split` chunks. The downloader slice already speaks
multi-file `files[]` (`model-catalog.ts`, `catalog-download.ts`) but nothing
defines the chunk convention. This task pins the contract both sides share.

## Scope

- Manifest convention: split layout (`-00001-of-000NN.gguf`), parts sized for
  parallel fetch (<=512MB class), first-file discovery, per-chunk
  `sizeBytes` + `sha256` (verified when present, recorded otherwise — same
  rule as `model-downloader.ts`).
- `catalog-download` + `model-manager`: chunk set downloads with aggregate
  progress and per-chunk resume; assembled-header probe before mark-ready;
  manager lists the chunk set as one model (`storedFiles` prefix grouping
  already exists — extend, don't fork).
- Host publishing docs: split command, checksum generation, manifest entry
  example.

## Acceptance Criteria

- [ ] Convention documented (naming, size class, discovery, verify rule).
- [ ] Multi-chunk entry downloads, resumes mid-set, and probes clean.
- [ ] Chunked entry renders as a single model with per-chunk progress.
- [ ] Unit tests for naming/discovery/aggregate-progress; coverage >= 80%.
- [ ] `bun run check` green in the worktree.

## Out of scope

wllama engine itself (companion ticket); single-blob ONNX entries unchanged.
