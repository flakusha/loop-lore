# Epic: Items

**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** items, objects, world-items, interactable, loot

## Overview

Items specification — covers item types, properties, interactions, loot tables, and item lifecycle. Supersedes item sections in `docs/spec/actors.md`.

## Reference

- Spec: `docs/spec/items.md`
- Related: `docs/spec/actors.md`, `docs/spec/inventory.md`

## Item Systems

### Core Item Model
interface Item {
}
interface ItemType {
}
interface ItemProperty {
}
interface LootTable {
}
interface ItemInteraction {
}

## Acceptance Criteria

- [ ] Item type system implemented
- [ ] Item properties and interactions working
- [ ] Loot tables functional
- [ ] Item lifecycle (create, use, destroy) operational
