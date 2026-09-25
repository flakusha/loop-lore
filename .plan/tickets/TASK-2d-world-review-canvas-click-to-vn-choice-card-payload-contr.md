<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: 2D world review: canvas click to VN choice-card payload contract

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Shared canvas-click to VN choice/StoryEvent payload contract.
**Context:** epic-2d-sprite-world + game-frontend-scenes InteractiveScene.
**Acceptance Criteria:** Contract + validation schemas; no renderer work.

## Summary

Epic epic-2d-sprite-world settles canvas-as-VN-input (clicks/answers feed existing VN/choice-card flow: src/routes/chats/vn-choices.ts + src/frontend/vn/choice-cards.ts), and epic-game-frontend-scenes defines an InteractiveScene click-to-StoryEvent contract - but nothing links the two. Define the shared payload contract mapping canvas clicks (actor/zone/answer) to VN choice-select + StoryEvent payloads, usable by both canvas and Unity/Godot SDK example scenes. Contract + validation schemas only; no renderer work.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
