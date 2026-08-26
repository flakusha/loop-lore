<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Document Emotion Avatars spec

**Status:** 🟡 In Progress
**Priority:** P3
**Epic:** epic-docs-reconciliation
**Labels:** docs, spec, emotion-avatar
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
