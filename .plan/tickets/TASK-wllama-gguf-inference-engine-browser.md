<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: wllama GGUF inference engine (browser)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Labels:** byok, local-models, wasm, inference, llama, browser
**Epic:** epic-byok-local-models.md
**Related:** FEAT-byok-local-models.md

## Summary

Browser-side llama.cpp inference via `@wllama/wllama` (epic Mode 1) — the one
remaining gap after the sibling slices. Consumes, does not rebuild: per-file
manifest + catalog mirror, Range-resume downloader, IndexedDB storage, GGUF
probe (`browser-model-downloader`), policy-filtered manifest
(`local-model-download-policy`).

## Scope

- wllama worker behind the existing `EngineRequest`/`Response` protocol
  (`src/frontend/alpine/local-engine-protocol.ts`); standalone bundle via
  `scripts/build-frontend.mjs`, same pattern as `local-engine.worker.js`.
- `wllama-webgpu` / `wllama-wasm` engine kinds + GGUF catalog entries in
  `src/inference/manifest.ts`; first catalog entry is a tiny GGUF
  (wllama `stories15M` class) for CI-friendly spikes.
- Stored-chunk → worker handoff from `model-storage` (`<model>/<file>` keys);
  probe-then-load via `gguf-probe` before first inference.
- Token streaming through the `generated`/`progress` response shapes.
- Single-thread first: no COOP/COEP change in this task (multithread staged
  separately — server sets neither header today).
- `license:check` for the new dep before landing.

## Acceptance Criteria

- [ ] GGUF catalog model loads from stored chunks and generates text in a
      headless WASM run (single-thread, no COOP/COEP).
- [ ] Invalid blob rejected by probe before load; every failure surfaces as
      `LocalInferenceUnavailable` (server fallback preserved).
- [ ] Policy-blocked models never advertised (inherits manifest filtering).
- [ ] New module coverage >= 80% (else waiver + ticket).
- [ ] `bun run check` green in the worktree.

## Out of scope

Downloader, storage, probe, tunnel connector, download policy (siblings).
FEAT checkboxes get ticked by owning worktrees at finalize time.
