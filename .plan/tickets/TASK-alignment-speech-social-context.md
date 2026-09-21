<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Alignment dialogue gating + context-aware speech formality

**Summary:** Dialogue conditions (DialogueCondition in epic-social-interaction.md:456, spec-only) do not check character alignment, and SpeechPatterns (src/characters/spec/character.ts) have no context-driven variant selection. Gate dialogue options on speaker/listener alignment (lawful/chaotic, good/evil axes) and select formal/informal speech variants from social context (talking to a faction leader → formal; tavern during Festival → informal).
**Context:** Social-seam ticket for epic-character-world-integration.md; timeline conditions JSON (src/story/timeline/event-steering.ts) is the primitive precursor for persisted dialogue conditions; world state from TASK-world-state-motivation-context supplies the Festival/War context signal.
**Acceptance Criteria:** DialogueCondition supports type "alignment" evaluated against the canonical alignment field; unavailable options are hidden (not refused) with a test per axis pair; SpeechPattern variant selection consumes social context (listener role, location, world state) and is overridable by explicit author hints; prompt rendering uses the selected variant; tests for gating and variant selection.

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Dialogue owner: .plan/epics/epic-social-interaction.md (DialogueNode/DialogueCondition)
- Consumes: src/characters/spec/character.ts (alignment, SpeechPatterns), src/story/timeline/event-steering.ts
- Depends on: TASK-shared-character-domain-models, TASK-world-state-motivation-context (context signal)

**Branch:** open on dev.
