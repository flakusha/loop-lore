<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: GGUF KV typed reader with arch-templated key registry

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-model-metadata-read
**Tags:** models, metadata, gguf

**Summary:**

Extend GGUF reading beyond the existing header-count probe (src/frontend/alpine/gguf-probe.ts reports version/tensorCount/kvCount only): typed key-value extraction (ReaderField-style: type, offset, decoded value) plus a canonical key registry with {arch} templating (general.name, general.architecture, {arch}.context_length, quantization version) so GGUF models expose display metadata server-side and in the browser.

Reference: llama.cpp gguf-py/gguf/gguf_reader.py (GGUFReader.get_field, _build_fields); gguf-py/gguf/constants.py Keys.General.*/ Keys.LLM.* format(arch=...); existing TS cursor code in src/frontend/alpine/gguf-probe.ts and the Rust gguf module vectors it mirrors.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
