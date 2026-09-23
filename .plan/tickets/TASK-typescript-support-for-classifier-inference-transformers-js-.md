<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: TypeScript support for classifier inference (transformers.js / ONNX in-browser + server)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

TS-side classifier inference reusing existing browser-engine + server seams.

Grounded state:
- Browser: src/frontend/alpine/local-engine.ts already spawns transformers.js (ONNX) and wllama (GGUF) workers with lazy CDN load, LocalInferenceUnavailable fallback, readiness-gated downloads. Classifier-shaped tasks eligible today: prompt-improve/prompt-analyze only (ELIGIBLE_TASKS, local-inference.ts). Encoder ONNX (MiniLM, ModernBERT, bge-reranker) fits transformers.js pipeline('text-classification'/'feature-extraction') natively.
- Server (Bun): no ONNX runtime dependency today; options are transformers.js-node, onnxruntime-node, or HTTP sidecar to llama-server/Python.

Scope: extend ELIGIBLE_TASKS + engine generate() with classify/rerank ops for browser path; spike server-side ONNX vs sidecar decision with cold-start + per-call latency numbers against AUX budgets. No new dep until spike lands.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
