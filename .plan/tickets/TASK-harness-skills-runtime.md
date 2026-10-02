<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness skills runtime (SKILL.md loader + curator)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Runtime skill ingestion from existing `SKILL.md` frontmatter (`SkillManifest` + `src/agents/skills/loader.ts` reusing the plugin dir-scan); triggers map to workflow-routing intents; usage-telemetry curator auto-archives stale agent-created skills.
**Context:** Skills are human-only today: 9 `SKILL.md` in `.agents/skills/`, zero `skill://` hits in `src/`. Name collision: `epic-skills.md` (Done/UNWIRED) is game character-skills, unrelated. opencode `customize-opencode` is the contextual-activation pattern; hermes curator (usage `.usage.json`, auto-archive, pinned exempt) is the hygiene shape.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `SkillManifest` parsed from `SKILL.md` frontmatter (name/description, lenient name≠dir per Agent Skills standard); loader reuses plugin dir-scan + config YAML parsing; triggers map to `workflow-routing.ts` intent patterns.
- [ ] Contextual activation: skill content loads only when its trigger matches (never dumped wholesale into every prompt).
- [ ] Curator: per-skill usage telemetry; auto-archive (never delete) stale agent-created skills; pinned exempt. Marketplace explicitly deferred.
- [ ] Unit tests for frontmatter parse + trigger match + archive policy.

## Related Files

- `.agents/skills/` (9 SKILL.md), `src/agents/skills/loader.ts` (new), `src/assistant/workflow-routing.ts`
- `epic-skills.md` (game skills — do NOT conflate), `epic-plugin-system.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
