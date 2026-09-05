<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: vn choice FE/BE contract mismatch renders blank labels

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

src/frontend/vn/choice-cards.ts:83-93 loads ?scene= expecting data[].text/is_active/selection_count/choice_index; new backend returns {choices:[{label,selected,selected_at}]} reading ?sceneIndex; legacy {data:[{label,status,...}]}. selected always false; label undefined -> blank. Align one backend shape + query key to FE (or update FE).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
