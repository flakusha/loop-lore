<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: AV1 cross-panel regen triggers avatar cache reload (RegenxBinding)

**Status:** Not Started
**Priority:** low
**Effort:** Small

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** S (cross-panel reload signal plus test)
**Summary:** Cross-panel regen completion triggers loadEmotionAvatars so chat avatarForMessage results refresh: no stale face, no avatar-less window on failure.
**Context:** Source row matrix-emotion-avatar-assets.md AV1 (Regen x Binding). Filed from 02-extract-features.md candidate 6, R02 candidate 6 confirmed with file-list correction (BLOCKING-2 resolved). Files: src/frontend/alpine/actor-emotion-avatars.ts (refreshJob and listJobs sites) and src/frontend/alpine/mood/avatars.ts (_emotionAvatars cache, avatarForMessage :155-168, existing reload at :129-132). Narrowed behavior: cross-panel regen completion triggers loadEmotionAvatars; mood-panel-initiated refresh already exists. Dedup: grepped index.json for avatar inval and regen inval; only the DB job-store migration ticket, distinct.
**Acceptance Criteria:**
- Character-sheet batch regen completion triggers chat avatar cache reload with no stale face.
- Failure path shows no avatar-less window (fallback or retry).
- Tests cover cross-panel reload signal.
- bun run check green.
**Related:** 02-extract-features.md candidate 6, R02 candidate 6 and BLOCKING-2, TASK-persistent-regen-job-store-migration (distinct).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
