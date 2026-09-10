<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Generation-Asset Persistence Contract

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

Establish a contract between the generation pipeline and the asset persistence layer to ensure generated images are saved with valid metadata and reachable by the gallery service. Background: Currently, generation logic is decoupled from gallery storage. Scope: Define interface for asset creation after generation. Acceptance Criteria: New asset successfully recorded in DB with correct reference to generated file path.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
