<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Make the federation config panel editable in the config UI

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

federation has no entry in EDITABLE_KEY_MAP (src/config/sections/menu-data.ts:11-24), so every input on the federation config panel renders disabled and operators must hand-edit TOML to change enabled, seeds, peers, or duplication policy. Add the federation keys to the editable map. Acceptance: the federation panel renders enabled inputs for enabled, seeds, peers, and duplication; a saved value round-trips through the config write path and is read back after reload; existing panels and the disabled-by-default gating stay green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
