<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: HF id to display-name heuristics

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** model-metadata-read
**Tags:** models, metadata

**Summary:**

Derive display name, finetune/version, and size-label components from HF-style ids/filenames (`<org>`/`<name>`, name vXL/precise variants) so models without embedded metadata still get clean card titles.

Reference: llama.cpp gguf-py/gguf/metadata.py get_model_id_components + apply_metadata_heuristic; gguf-py/gguf/constants.py Keys.General.NAME.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
