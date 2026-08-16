<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Analytics & Meta

Insight-layer ideas. Inspiration: community requests, existing `model_comparisons`
table.

## #27 Conversation analytics

- **Inspiration**: community request
- **What**: Sentiment over time, word clouds, token cost, story-beat map per chat.
- **Fits**: `generation` token counts already tracked.
- **Effort**: Low
- **Depends on**: message metadata

## #28 Model-comparison dashboard

- **Inspiration**: notifications-expansion.md
- **What**: Aggregate leaderboard from the `model_comparisons` table; side-by-side A/B
  view.
- **Fits**: `model_comparisons` table already specced
  (`docs/spec/notifications-expansion.md`).
- **Effort**: Low
- **Depends on**: comparison API (table needs creation per spec)

## #29 Synthetic fine-tune data export

- **Inspiration**: roadmap P3
- **What**: Turn chats into instruction/character datasets for fine-tuning.
- **Fits**: `docs/spec/artifacts-system.md`.
- **Effort**: Med
- **Depends on**: artifacts system

## #30 Automated balance playtest bot

- **Inspiration**: novel
- **What**: AI plays your character to test RPG balance (stat/item tuning).
- **Fits**: `docs/spec/rpg-mechanics.md` engine.
- **Effort**: High
- **Depends on**: RPG engine
