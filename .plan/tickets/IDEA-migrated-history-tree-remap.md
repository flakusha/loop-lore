# IDEA: Migrated Chat History — Message Tree + Swipe Remap

**Status**: open
**Priority**: low
**Labels**: chat, migration, messages, swipe, tree, carry
**Assignee**:
**Epic**: epic-messages
**Related**: FEAT-chat-template-config-lifecycle, FEAT-message-swipe-replay-branch,
.plan/epics/epic-config-templates.md

## Description

`migrateChat` carries full history (`carry.history: "full"`) as a **flat branch**:
messages are copied with `parent_id` left pointing at the source chat's message IDs
(which do not exist in the migrated chat) and `swipe_index` un-remapped. The active-leaf
flatten (see the swipe/replay design) treats migrated history as a single linear path.

Idea candidate (deferred — too much effort now, per owner): remap the message tree and
preserve swipe variants on migration so the migrated chat keeps the full branching
structure and alternative variants, not just the active leaf path.

## Design Sketch

1. **Parent remap**: build `oldId → newId` map while copying messages; rewrite each
   copied message's `parent_id` to the new id (root messages keep `null`).
2. **Swipe preservation**: for each source group of sibling variants (same `parent_id`
   - `swipe_index`), preserve `swipe_index` on the copies so the variant switcher still
     lists all alternatives.
3. **Active leaf**: keep the currently-selected variant as the active leaf so the
   flattened timeline is unchanged.

## Acceptance Criteria

- [ ] Migrated chat preserves full message tree (parent/child links intact)
- [ ] Swipe variants survive migration (variant switcher lists all alternatives)
- [ ] Active leaf unchanged after migration
- [ ] Tests: tree remap, swipe preservation, root-orphan handling

## Notes

- Requires the swipe/variant model to be stable first (see FEAT-message-swipe-replay-branch).
- World/npc/location state carry (`carry.worldState`) is separate and already implemented.
