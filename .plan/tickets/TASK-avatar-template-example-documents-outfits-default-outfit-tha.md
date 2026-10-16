<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Avatar template example documents outfits/default_outfit that the loader ignores

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

configs/templates/avatar.example.yaml:66-98 documents an outfits: block and a default_outfit: key (both commented out) for the wardrobe/avatar-variant epic. src/config/templates-loader/ contains zero occurrences of outfit - AvatarTemplateConfig (src/config/sections/templates.ts:137-143) is merge, emotions and intentPatterns only. Uncommenting the block produces keys that are silently ignored.

The wardrobe fields do exist on the character domain, where they are wired: default_outfit, outfits and loadouts at src/config/sections/templates.ts:210-212. So the avatar-domain copy is premature rather than wrong.

Either wire the avatar-domain block or remove it from the example until the wardrobe epic lands, so the example never advertises a capability it cannot honour.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
