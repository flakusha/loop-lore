<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Assistant Personality Selector UI

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-character-multi-personality
**Tags:** assistant, personality, ui

**Summary:**
UI on the chat/world admin panel for picking the assistant personality source (preset vs character vs server-default).

**Context:**
Affects which `promptBlocks` block the composer emits. World-RPG users want to swap personalities per chat (or globally per user) without opening the model config.

**Acceptance Criteria:**
- New alpine component `assistant-personality-picker`: three radio cards (Preset / Character / Default), with conditional sub-options.
- Hooked into chat settings page and world admin page.
- Picker writes to `AssistantPersonalityState` (per chat, optional world override, optional user default).
- Snappy: optimistic UI + htmx fallback.
- Tests: hand-test in dev-server; smoke asserts API roundtrip.
