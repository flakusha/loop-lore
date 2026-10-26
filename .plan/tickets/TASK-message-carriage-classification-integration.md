<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message carriage classification integration

**Summary:** Let classify-intent (plus split/transition) consume carriage labels; keep the English-assumed raw-text path as fallback.
**Context:** `src/generation/auto-gen/classify-intent.ts:40-43` classifies raw text directly and assumes English. With carriage rows present, the classifier can read `classification_labels` / `detected_locale` (e.g. translate-then-classify or locale-aware routing) instead of misreading non-English input. Raw-text classification stays — it is the fallback when no carriage row exists, never removed.
**Acceptance Criteria:**

- [ ] classify-intent reads the carriage row when present and uses labels/locale for non-English input
- [ ] Missing carriage row falls back to current raw-text classification byte-identically
- [ ] Split/transition classifiers get the same consume-or-fallback treatment
- [ ] Tests cover: carriage-present non-English input, carriage-absent fallback, fill-failure path
- [ ] Docs updated

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-multilingual-carriage

git issue: b1c7116
