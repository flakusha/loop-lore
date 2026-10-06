<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Document Emotion Avatars spec

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Priority:** P3
**Epic:** epic-docs-reconciliation
**Tags:** docs, spec, emotion-avatar
**Related:** src/characters/services/emotion-avatar-service/*, src/characters/services/emotion-avatar-fallback.ts, src/assistant/prompt/sections/emotion-avatar.ts, README.md (Emotion avatars row)

## Summary

README lists **Emotion avatars** as WIP with `_spec pending — tracked in .plan/`_,
but the feature is implemented (`EmotionAvatarService`, generation dispatch,
emotion→modifier mapping, job store, metadata-extraction fallback, assistant
prompt section). No `docs/spec/emotion-avatars.md` exists, so docs do not reflect
this current feature.

Author `docs/spec/emotion-avatars.md` in the `docs-current-features` worktree,
covering the service API, generation flow, emotion model, fallback, and prompt
integration. Wire it into the VitePress sidebar (Characters & RPG group) and link
it from the README features table.

## Acceptance Criteria

- [ ] `docs/spec/emotion-avatars.md` exists and describes the implemented surface (verified against `src/`)
- [ ] Sidebar entry added under Characters & RPG
- [ ] README Emotion avatars row links the new spec
- [ ] `bun run md:lint` + `bun run format` pass on the new file

## Clarification 2026-09-26

Current behavior: `docs/spec/emotion-avatars.md` EXISTS (4.1KB). Sidebar entry exists at `docs/.vitepress/config.mts:93` under Characters & RPG. Implementation surface: `src/characters/services/emotion-avatar-service/` (`index.ts:19-63` service shell, `emotions.ts`, `generation.ts`, `job-store.ts`, `types.ts`), metadata-extraction fallback in `src/characters/services/emotion-avatar-fallback.ts`, prompt integration in `src/assistant/prompt/sections/emotion-avatar.ts:14-46` (`emotionAvatarSection`, enabled on `emotion`/`emotionAvatar` params, emits wrapped `emotion_context` system section).

Scope disambiguation: same README caveat as the sibling doc-spec tickets — `README.md:39-41` has no features table, so the "README row links spec" criterion needs reinterpretation. Spec must additionally cover the in-memory job-store lifetime (server lifetime, `index.ts:16-17`) as a known limitation.

Scoped next step: verify spec against the service/job-store/fallback/prompt-section surface, run `bun run md:lint` + `bun run format`, then close. Nearest open work is ticket `BUG-EMOTION-AVATAR-FALLBACK-METADATA-INCOMPLETE`; no open git issue directly topical.

Acceptance:

- [ ] Spec describes service API + generation flow + emotion model + fallback + prompt section (verified vs `src/`)
- [ ] Job-store volatility documented as a limitation
- [ ] `bun run md:lint` + `bun run format` pass on `docs/spec/emotion-avatars.md`
