<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Gate world_lore lifecycle confidence-distortion-disputed triple

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

world_lore_entries confidence x distortion_level -> disputed (005) computed in assistant/lore/lifecycle.ts:isDisputed but unwrapped at DB boundary. Convert disputed reads to DisputedState machine + CompositeValidator wrapping existing resolver. Unit test. No column changes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
