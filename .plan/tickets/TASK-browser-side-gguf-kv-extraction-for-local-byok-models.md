<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser-side GGUF KV extraction for local BYOK models

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** byok-local-models
**Tags:** frontend, gguf, byok

**Summary:**

Extend the frontend gguf probe (src/frontend/alpine/gguf-probe.ts, currently header counts only) to extract typed KVs (general.name, {arch}.context_length, quant) for BYOK/local models loaded via wllama/local-engine, reusing the shared key registry from the server-side GGUF KV reader.

Reference: llama.cpp gguf-py/gguf/constants.py Keys.General.*/Keys.LLM.*; gguf-probe.ts existing WASM ll_gguf_probe path + pure-TS cursor; src/frontend/alpine/model-catalog.ts CatalogModel.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
