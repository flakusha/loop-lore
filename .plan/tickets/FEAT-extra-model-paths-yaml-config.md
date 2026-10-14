<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Extra model paths YAML config

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** local-model-file-discovery
**Tags:** models, config

**Summary:**

Support an extra-model-paths style YAML config: top-level base_path (expanduser/expandvars, resolved relative to the yaml file's directory) + per-category newline-separated subpaths; merge into the category registry at startup; repeatable config files. Read-only: loop-lore never rewrites the user's yaml.

Reference: ComfyUI utils/extra_config.py load_extra_path_config + main.py:132-139 (built-in file + repeatable --extra-model-paths-config); folder_paths.add_model_folder_path(is_default).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
