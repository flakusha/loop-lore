<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Spell Crafting & Magical Discovery

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-magic-spell-systems
**Tags:** magic, spell-crafting, discovery, enchanting, research

## Description

Add spell crafting and magical discovery mechanics to the Magic & Spell Systems epic — players can research and create new spells, discover magical artifacts, and experiment with spell components. Extends the existing spell system from consumption to creation.

## How It Extends Existing Work

Builds on the Magic & Spell Systems epic's spell schools, elements, mana management, and paradigms. Adds a creation/discovery layer on top of the existing spell consumption system.

## Acceptance Criteria

- [ ] Spell crafting interface — combine components to create new spells
- [ ] Spell research system — discover spells through experimentation and study
- [ ] Magical artifact discovery (rare items with spell-like properties)
- [ ] Spell modification — alter existing spells (element swap, power boost, area change)
- [ ] Spell experimentation journal — track discoveries and failed attempts
- [ ] Mana cost and component balancing for crafted spells
- [ ] `GET/POST /api/magic/spells/craft` routes
- [ ] `GET /api/magic/spells/discoveries` — list discovered spells
- [ ] Frontend spell crafting workshop UI
- [ ] Frontend research lab with experimentation interface

## Technical Notes

- Crafted spells stored with origin spell_id, modification diff, and component cost
- Discovery uses probabilistic success based on character INT/WIS and research time
- Failed experiments consume components but may yield partial knowledge (clues)
- Integrates with Item System Extension epic for component items
