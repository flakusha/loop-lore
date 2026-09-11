<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Carriage Visibility Tiers — Hidden / Filtered / Visible

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, feature, carriage, visibility, memory
**Epic:** epic-chat-product-features

## Summary

Extend carriage with an explicit three-tier visibility model. `epic-hidden-carriage-context` and `TASK-chat-feature-notes-shadow-carriage` currently hard-rule carriage as **never user-facing** (dev `?` debug view only); this ticket adds the two missing tiers as opt-in per-chat configuration, without weakening the server-side enforcement the hidden epic establishes.

Tiers:
- **hidden** (default, today's behavior) — dev/debug `?` view only; never in participant render paths.
- **filtered** — selected fields (episode counter, title, discovered locations) are promoted into player-visible memory/recap via the existing shareability pipeline; raw carriage block stays hidden.
- **visible** — the whole carriage block renders to authorized participants (gm/admin chats, validation harnesses) as a read-only recap panel.

## Acceptance Criteria

- [ ] `carriage_visibility ∈ {hidden, filtered, visible}` is per-chat config; default `hidden` preserves all existing behavior
- [ ] Tier is enforced server-side in the assembler (same rule as shadow isolation) — never UI-only filtering
- [ ] `filtered` promotion reuses `src/memory/shareability.ts` gating and the dedup-by-content-hash assembly rule; a fact promoted once is not double-injected
- [ ] `visible` renders read-only; no participant action can write back into carriage from the visible panel
- [ ] gm-class shadow entries remain excluded from player prompts under every tier
- [ ] Encryption: carriage payloads in visible/filtered render paths respect chat-key encryption like message content

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `epic-hidden-carriage-context` — carriage shape, shadow isolation, enforcement site
- `TASK-chat-feature-notes-shadow-carriage` — annotation shareability rules this extends
- `TASK-shadow-visibility-debug-assistant` — debug-visible tier this generalizes
- `TASK-chat-feature-context-memory-events` — injection pipeline consuming promoted fields

## Files

- `src/chat/service/` — carriage assembly + tier enforcement
- `src/memory/shareability.ts` — filtered-tier promotion gate
- `src/components/chat/` — visible-tier recap panel

## Open Questions

- Can `filtered` field selection be customized per chat, or is the promoted-field set fixed?
- Does `visible` require chat-admin authority, or any participant in solo RPG chats?
