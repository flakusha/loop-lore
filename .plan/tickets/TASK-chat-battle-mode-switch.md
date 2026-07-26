# TASK: Chat Switch to Battle Mode (Turn-Based)

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-battle-action-systems
**Tags:** battle, turn-based, chat-mode, mode-switch, combat

## Description

Add the ability to switch an active chat from normal RP mode to turn-based battle mode. When a battle is triggered, the chat interface transforms into a battle UI with turn order, action selection, and combat mechanics. Extends the Battle & Action Systems epic with chat-to-battle mode switching.

## How It Extends Existing Work

Builds on the Battle Action Systems epic's turn-based mechanics, battle UI, and battle state. Adds chat-to-battle mode switching on top of the existing battle infrastructure.

## Acceptance Criteria

- [ ] Chat-to-battle mode switch trigger (GM command, player action, scripted event)
- [ ] Battle mode UI overlay on existing chat (turn order, action buttons, combat log)
- [ ] Turn order display within chat context
- [ ] Action selection UI (attack, defend, use item, cast spell, flee, negotiate)
- [ ] Battle state display (health, mana, status effects) in chat format
- [ ] Turn resolution with LLM involvement (narrative description of actions)
- [ ] Battle-to-chat switch (return to normal RP after battle ends)
- [ ] Battle results summary (XP, loot, consequences)
- [ ] `POST /api/chat/:id/battle/start` — start battle in chat
- [ ] `POST /api/chat/:id/battle/action` — submit a battle action
- [ ] `POST /api/chat/:id/battle/end` — end battle and return to chat
- [ ] Frontend battle mode toggle button in chat toolbar
- [ ] Frontend turn indicator and action menu in chat
- [ ] Config: enable/disable battle mode per world/chat

## Technical Notes

- Battle mode uses the existing battle mechanics from Epic Battle Action Systems
- Chat-to-battle switch preserves chat history and context
- Turn resolution uses the existing LLM pipeline with battle-specific prompt templates
- Battle state is stored in chat metadata (not a separate entity)
- Integrates with Chat Lifecycle & Moderation epic for mode-based feature permissions
- Integrates with Character Core System for character stats and health
