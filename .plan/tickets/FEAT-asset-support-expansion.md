<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Asset Support Expansion

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** (none — proposed epic never materialized)
**Epic Note:** original value "epic-asset-support-expansion" preserved 2026-10-23; no epic file exists.

## Summary

Asset support expansion: multi-format character import (PNG/YAML/TOML/CHARX), signed URLs for downloads, asset storage compression, asset versioning, asset templates.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Research addendum (2026-11-25)

- Shader/material metadata activation is gated on a named gallery consumer; research found none, so no new ticket is filed.
- Format expansion should reuse the shared `AssetType` and MIME-map corrections from the 3D tickets instead of adding a parallel validator.
- Template/prompt pack sources remain prompt-text only; upstream NOTICE does not grant third-party character or content rights.
