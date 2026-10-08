<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: SC scene.starved narrator-absent coverage signal (scene-coverage.ts)

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** M (new scorer plus GM spotlight consumer plus UI hint)
**Summary:** Build the narrator-absent coverage signal: a coverage scorer counts narration-kind messages per scene window and below threshold raises scene.info.starved; GM spotlight escalates and the UI shows a subtle scene-needs-narration hint.
**Context:** Source row matrix-story-coherence.md Cross-System Events (scene.info.starved to GM spotlight, UI hint). Filed from 02-extract-features.md candidate 10, R02 candidate 10 confirmed green-field. Files: new src/story/quality/scene-coverage.ts, src/story/game-master (spotlight consumer), chat UI hint component. Axis is real: MessageContentType.Narration in src/db/enums-core/messages.ts with established narrator-actor write paths. UI hint string times 10 locale files plus scorer and spotlight tests. Dedup: grepped index.json and src for starved and spotlight; zero hits.
**Acceptance Criteria:**
- Coverage scorer counts narration-kind messages per scene window and raises scene.info.starved below threshold.
- GM spotlight consumes the signal and escalates narration.
- Chat UI shows a subtle scene-needs-narration hint, localized in all 10 locale files.
- Scorer and spotlight tests cover threshold, above-threshold silence, and escalation.
- bun run check green.
**Related:** 02-extract-features.md candidate 10, R02 candidate 10, turn.skipped hook ticket (sibling signal).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
