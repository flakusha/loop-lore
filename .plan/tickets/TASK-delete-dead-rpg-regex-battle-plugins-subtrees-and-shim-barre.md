<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Delete dead rpg/regex/battle/plugins subtrees and shim barrels

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Delete the unreferenced integration-registry tree, the dead regex tier, test-only rpg services and shim barrels. Must update scripts/check/test-gaps-baseline.json in the same change. Research: the rpg slice of the over-engineering audit (scratch, not on disk). Re-derive with 'bun run dead:code:src'.

**Context:**

Four gameplay-adjacent subtrees are unreachable from any real entrypoint; the rest are test-only
exports and per-module shim barrels with a single importer each. Every finding below was verified by
explicit grep — **knip is not evidence on this repo**: it does not resolve `from "./foo.js"` specifiers to
`foo.ts`, and `.js` specifiers are the dominant convention here. Source:
the rpg slice of the over-engineering audit (scratch, not on disk). Re-derive with `bun run dead:code:src`.

**Scope — whole-file deletions:**

- `src/rpg/integration-registry/` in full — `index.ts:1-124`, `queries.ts:1-274`, `types.ts:1-213`,
  `contracts.ts:1-108`, `player-state-layers.ts:1-104`, `register.ts:1-70`, `mermaid.ts:1-37`,
  `edge-key.ts:1-21`, `edges/index.ts:1-37`, `edges/core-misc.ts:1-128`, `edges/battle.ts:1-111`,
  `edges/social-crafting.ts:1-73`, `edges/housing.ts:1-60`, `edges/nsfw.ts:1-60`,
  `edges/crime.ts:1-59`, `edges/disease.ts:1-59`, `edges/faction.ts:1-46`.
- `src/regex/index.ts:1-196` plus the modules only it imports — `story-events.ts:1-112`,
  `slugs.ts:1-60`, `memory-classification.ts:1-54`, `narrative.ts:1-36`, `placeholders.ts:1-31`,
  `template.ts:1-27`, `commit.ts:1-20`, `dice.ts:1-20`. **Keep** `html-sanitize`, `image-edit`,
  `intent`, `music-urls`, `safe-exec`, `state-machine`, `affection-transitions`, `entity-intent`,
  `telemetry`, `action-parser`, `affordance` — they have direct importers.
- `src/regex/stage2-llm.ts:1-240` — no production caller constructs a `Stage2Parser`.
- `src/rpg/reputation.ts:1-196` and `src/rpg/chemistry.ts:1-132` — shadowed by the live
  `src/schemas/reputation.ts` (consumers: `src/rpg/service/battles/social.ts:25`,
  `src/assistant/commands/interaction.ts`) and by the shared `status_effect` store.
- `src/rpg/loot/templates.ts:1-126` — hardcoded loot-table fixtures shipped in `src/`; the only
  production consumer (`src/routes/rpg/xp-loot.ts:24`) imports `generateLoot`/`persistLoot` and the
  types, never the templates. Also drop the re-export at `src/rpg/loot/index.ts:20-24`.
- `src/plugins/mount-points.ts:1-38` (plus the re-export at `src/plugins/index.ts:17-21`).
- `src/battle/resolution-integration/dc.ts:14-45` (`getCombatDC`) and
  `src/battle/resolution-integration/initiative.ts:18-28` (`makeInitiativeRoll`, superseded by
  `src/rpg/combat/initiative.ts`) plus their re-exports at `src/battle/index.ts:84,89`.
- Pure re-export shims with no real caller — `src/rpg/body.ts:1-4`, `body-systems/index.ts:1-16`,
  `encounters.ts:1-5`, `encounters/index.ts:1-17`, `fantasies.ts:1-5`, `fantasies/index.ts:1-15`,
  `seduction.ts:1-5`, `seduction/index.ts:1-17`, `intimacy.ts:1-27`, `intimacy/index.ts:1-16`,
  `location-nsfw/index.ts:1-16`, `blog/index.ts:1-26`, `mood.ts:1-16`, `quests.ts:1-16`,
  `nsfw-skills.ts:1-21`, and the root barrel `src/rpg/index.ts:1-39` once the shims go.

**Scope — partial deletions inside live files:**

- `src/regex/action-parser.ts:170-260` — delete `parseAction`, `parseActionStage1`,
  `actionToLegacyIntent`. **Keep** `VERB_VALUES`, `Verb`, `ParserStage`
  (`src/services/affordance/lookup.ts:14`, `src/services/affordance/telemetry.ts:23` need them).
- `src/rpg/shared/rpg-service-utils.ts:30-54,68-86` — delete `assertRowUpdated`, `assertRowDeleted`,
  `getOrCreateRow` (sole caller is the file's own coverage test). **Keep** `getRpgLog`, `nowAndId`,
  `parseJsonField`.
- `src/plugins/bundles.ts:36-79,87-93` — delete `getRequirementsForBundle`,
  `validateCharacterForBundle`, `FANTASY_RPG_REQUIREMENTS` and the re-exports at
  `src/plugins/index.ts:23-28`.

**Evidence:**

- `grep -rn "integration-registry" src/ scripts/ plugins/` → the directory's own files, its tests,
  a doc comment at `src/rpg/crafting/discovery.ts:22`, and a path index in
  `scripts/check/test-gaps-baseline.json`. No import statement anywhere.
- `grep -rn "from \"../regex\"|from \"./regex\"|from \"../../regex\"|regex/index" src/ scripts/ plugins/` → no matches.
- `grep -rn "ReputationService|ChemistryService|rpg/reputation|rpg/chemistry" src/ scripts/ plugins/`
  → definitions, the dead `src/rpg/index.ts` barrel, tests, one comment at
  `src/rpg/seduction/service/attempt.ts:124` (*"never by querying ChemistryService"*), and the
  gap-baseline index.
- `grep -rn "COMMON_CONSUMABLES|WEAPON_LOOT|ARMOR_LOOT|loot/templates" src/ scripts/ plugins/` →
  definitions, `src/rpg/loot/index.ts:21-23`, `src/rpg/loot.test.ts:8,15`, gap-baseline.
- `grep -rn "getCombatDC" src/ tests/` and `grep -rn "makeInitiativeRoll" src/ tests/` → the
  definition, two re-exports, and the module's own test only.
- `grep -rn "getRequirementsForBundle|validateCharacterForBundle|FANTASY_RPG_REQUIREMENTS" src/ tests/`
  → definitions, the barrel re-export, `bundles.test.ts`, and an unrelated literal copy at
  `src/frontend/alpine/character-extension-editor.test.ts:17`.

**MANDATORY same-change update:** `scripts/check/test-gaps-baseline.json` indexes uncovered symbols
as `"<path>#<symbol>"`. These deletions strand its indexed entries — the ones under
`src/rpg/integration-registry/`, `src/rpg/loot/templates.ts`, `src/rpg/chemistry.ts#CHEMISTRY_EFFECTS`
and `src/plugins/mount-points.ts`. Remove them in the SAME change, or the test-gap tool reports
phantom gaps against files that no longer exist and its gate fails. Do not regenerate the whole
baseline — that would launder unrelated pre-existing drift into this change.

**Caveats / constraints:**

- `from "../rpg"` at `src/routes/v1/actors-surface.ts:36` is `rpgRoutes` from `../rpg` =
  **`src/routes/rpg`**, not `src/rpg`. This path collision is exactly what makes `src/rpg/` look
  live; verify by resolving the path before cutting.
- The `src/frontend/alpine/character-extension-editor.test.ts:15-20` comment says outright that it
  keeps its own literal copy of the bundle requirements *rather than* importing them — so no
  production caller depends on `FANTASY_RPG_REQUIREMENTS`. But this is a declared-but-unenforced
  contract (`PluginManifest.characterRequirements` has no reader in `src/`): if bundle character
  validation is a planned feature rather than an abandoned one, the correct fix is to wire it. The
  audit flags that judgment call rather than asserting it — raise it with the owner before deleting.
- Test files that lose their only subject (`dc.test.ts`, `initiative.test.ts`, `stage2-llm.test.ts`,
  `bundles.test.ts`, parts of `placeholders.test.ts`) go with the cut.
- Preserve the `src/rpg/crafting/discovery.ts:22` doc comment meaning — it names the deleted path as
  where integration edges *would* be declared; update the comment rather than leaving a dangling
  reference.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
