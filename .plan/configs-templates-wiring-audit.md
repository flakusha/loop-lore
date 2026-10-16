<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# configs/ wiring audit — templates, character configs, feature-addition candidates

Audit of `configs/` (character configs, templates) against the loaders in `src/`.
Read-only investigation; findings carry `path:line` evidence. Companion to
`epic-wardrobe-avatar-variants` (closed) and the template-loader suite.

Scope: what is loaded, what is dead, which documented behaviour does not exist,
and which additions the wiring could support next.

## 1. What is actually loaded

| Config path | Loader | Notes |
|---|---|---|
| `configs/templates/character.{yaml,yml,toml}` | `src/config/templates-loader/index.ts:115` → `mergeCharacterConfig` (`merge-domains.ts:58`) → seeded at `src/server/init-background-services.ts:43` → `src/characters/seed/templates.ts:113` | YAML wins over TOML |
| `configs/characters/*` | `src/config/character-loader.ts:194` (`loadCharacterFiles`), called at `templates-loader/index.ts:57` | Separate path — replaces `config.character.templates` wholesale |
| `configs/templates/chat-setup.{yaml,yml,toml}` | `src/chat/service/templates.ts:44` → `seedChatSetupTemplates` (`:166`) → `src/server/boot-seed.ts:25` | Idempotent upsert-by-slug against `chat_setup_templates` |
| `configs/templates/expansion.{yaml,yml,toml}` | `src/config/template-expansion/discovery.ts:22` → `run.ts:33`, wired at `src/config/load/load.ts:134` | No `.example` fallback |
| `configs/templates/{avatar,llm,sd,image-edit}.{yaml,yml,toml}` | `templates-loader/index.ts:63-125` | Per-domain merge strategy |
| `configs/templates/workflows/*.yaml` | `findWorkflowFiles` → `templates-loader/index.ts:136` | Assistant workflow templates + entity presets |
| `configs/workflows/*.json` | `src/generation/workflow-library/seed.ts` via `src/server/boot-seed.ts:26` | ComfyUI graphs → `prompt_templates` |
| `configs/env.{yaml,toml}`, `configs/config.<domain>.*` | `src/config/load/load.ts:83`, `src/config/load/domain.ts` | Standard domain configs |

Every `*.example.{yaml,toml}` file is **documentation only** — no discovery map
names an `.example` basename, and `TEMPLATE_FILES`
(`templates-loader/discovery.ts:12-26`) + the domain list (`load/domain.ts`)
produce only bare names.

## 2. Dead config — declared, typed, never read

These keys are accepted by the loaders and documented in the example files, but
no runtime consumer exists.

| Key / surface | Typed at | Read at | Verdict |
|---|---|---|---|
| `character` template `loadouts[]` | `src/config/sections/templates.ts:212`, `sections/characters/types.ts:66`, `schema-class/json-schema/templates.ts:29`, `config/sections/characters/defaults.ts:66-78` | **nowhere** | `item_match` appears only in loader/type/schema/defaults — the runtime bridge (`characters/services/wardrobe/loadout-bridge.ts:59-68`) matches on `actor_wardrobe` bindings, not on this array. `seedCharacterTemplates` (`characters/seed/templates.ts:113-139`) never writes it. **Dead.** |
| `character` template `target_roles` | `sections/templates.ts:206`, `config/sections/characters/defaults.ts:36` | **nowhere** | `seedTemplate` stores only tags/`is_template`/`is_default` in `actors.settings` (`characters/seed/templates.ts:94-100`). **Dead.** |
| `character` template `system_prompt` | `sections/templates.ts:200` | nowhere in the seed path | No `actors` column write; import paths handle it, templates don't. |
| `expansion.keywords` | `template-expansion/types.ts:16` | `run.ts:63-64` (tracked into a discarded result) | `expandAvatarConfig` (`expand.ts:15-67`) never merges it; `extractKeywords`/`extractActions` (`expand.ts:74,105`) have zero production callers. **Inert.** |
| `expansion.actions` | `template-expansion/types.ts:17` | `run.ts:67-68` (same) | **Inert.** |
| `expansion.generateMissingAvatars` | `types.ts:20` | `run.ts:80-87` | Log-only; `avatarsGenerated` hardcoded `0`; `// TODO` on `run.ts:84`. **No-op even when true.** |
| `EmotionEntry.asset` | `sections/templates.ts` | `run.ts:19` (non-empty check only) | Only used as a "is this emotion missing" probe. Never resolved to a path or served. |
| `configs/assets/**` | README claim: terminal step of the fallback chain | **no `src/` reference** (`grep configs/assets src/` → 0 hits) | The 33 PNGs are unreferenced bytes; the wardrobe ladder reads DB avatar rows (`characters/services/wardrobe/resolve.ts`). |
| `expansion.intentPatterns` | `template-expansion/types.ts:18` | `expand.ts:48-60` (merge) → **no consumer** | `detectAvatarChangeIntent` (`src/assistant/intent.ts:21`) is its only reader and has zero production callers — the user-message scan was removed from generation (`src/generation/auto-gen/prepare-generation.ts:13-17`; mood now comes from `character_mood.current_mood` via the PromptAssembler). The block is inert. |
| `validateExpansionConfig` | `run.ts:111` | tests only (`template-expansion.test.ts:524`) | Never invoked at load, so a typo'd `emotion:` in `expansion.yaml` merges silently. |
| `merge` in `character.yaml` | `sections/templates.ts:190` | merged against `TEMPLATES_DEFAULTS.character.templates = []` (`sections/templates.ts:259-262`) | Strategy is a **no-op** for the character domain; the effective merge is `characters/seed/merge.ts:27-29`, which is unconditionally user-wins-by-name. |

## 3. Documentation that does not match the code

1. **`configs/templates/character.example.yaml:141-162`** instructs the reader to
   switch `merge: extend → override` so wardrobe fields on a built-in character
   "now actually applied". False either direction: user templates win on name
   collision regardless of `merge`, and `merge` itself never participates in the
   merge with the built-ins (`characters/seed/merge.ts:27-29`).
2. **`configs/templates/character.example.yaml:126-139`** claims `loadouts` is
   "read by the wardrobe service today and applied when the loadout-bridge flag is
   enabled". The bridge resolves from `actor_wardrobe` + `actor_items.equipped`
   rows (`wardrobe/loadout-bridge.ts:59-68`); template `loadouts` never migrate
   into those rows.
3. **`configs/templates/chat-setup.example.yaml:21`** documents `worldId`, and
   `:21` shows `gmConfig: { assistantRole: gm }`. `toTemplateDefault`
   (`src/chat/service/templates.ts:104-122`) reads neither — `worldId` is dropped
   and `gmConfig` is hardcoded from `visualNovel` alone (`:117`).
4. **`configs/assets/README.md:93`** points at `bun run scripts/gen-wardrobe-samples.ts`
   — the script does not exist (`ls scripts/ | grep wardrobe` → empty). The
   fallback chain drawn at `:78` (`configs/assets/characters/<char>/default/happy.png`)
   has no code behind it.
5. **`expansion.example.yaml`** documents `keywords` + `actions` as expanding the
   base config; they are discarded (§2). Its 10 new emotions
   (`determined`, `playful`, `tired`, …) are outside `EmotionType`
   (`src/db/enums-character/avatar.ts:42-61`, 17 canonical values), and its
   `intentPatterns` map into a detector no runtime calls — so the file presents
   itself as the live extension path for avatar emotion detection when the whole
   pipeline it feeds is inert.

## 4. Feature-addition candidates

Ranked by (value ÷ size). Each is self-contained; none requires a migration.

### F1 — Wire `loadouts[]` into the runtime bridge (highest value)

The schema, defaults and docs already exist on both sides; only the *bridge* is
missing. Concretely: at character seed time, translate `loadouts[]` into
`wardrobe_items` rows + `actor_wardrobe` bindings keyed by the equipped item
instances whose name/id contains `item_match`, gated by the existing
`wardrobe_loadout_bridge` flag (`admin/config.ts:192`,
`menu-data.ts:93`). That makes the flag meaningful and turns the documented
`chest / item_match / outfit` contract into the ladder rung in
`wardrobe/resolve.ts:153-158` instead of requiring manual binding via
`routes/wardrobe-bindings.ts:61`.
Skipped for now because the manual path covers the same end state — add this when
a character needs loadouts without per-actor setup.

### F2 — Make `expansion` validation real

One call to `validateExpansionConfig` at `load/load.ts:134`, pushing the returned
strings into `expansionResult.errors` and logging them. Removes the silent
merge mode for a typo'd `intentPatterns[].emotion`.
Smallest diff of anything here. Note it is a *validation* fix, not a feature fix:
the `expansion` block itself has no runtime consumer (§2), so the ticket for it is
about making the failure visible, not making the block work.

### F3 — Emit a JSON-schema-driven example check

`configs/templates/*.example.yaml` has drifted from
`src/config/sections/templates.ts` + `schema-class/json-schema/templates.ts` in
three places (§3.1, §3.2, §3.3) and the drift is invisible until a user copies the
example. A gate that parses every `*.example.*` and asserts the keys are all in
the corresponding schema is the same shape as the existing `jscpd`/`db-schema`
advisory gates. Add when §3 is fixed by hand more than once.

### F4 — Character template: widen to the spec surface

`CanonicalCharacter` (`src/characters/spec/character.ts:192-229`) carries
`alternate_greetings`, `post_history_instructions`, `creator_notes`,
`character_version`, `nickname`, `nsfw_*`, `growth_mode`, `llm_assist_enabled`,
`lorebook`, `assets` — none are reachable from `configs/templates/character.yaml`.
Widening `CharacterTemplateConfig.templates[]` + the seed INSERT to that set
would make config-seeded characters as rich as imported ones (imports already
round-trip them: `src/characters/exporters/toml.ts:22-27`).
Add when a use case needs a richer seeded starter than the built-in trio.

### F5 — Serve or delete `configs/assets/`

Either the placeholder PNGs become a filesystem fallback rung in
`wardrobe/resolve.ts` (matching the README chain), or the README claim and the
PNGs go. Half-wired asset dirs that no code reads are pure maintenance debt.
Cheapest today: correct the README.

## 5. In-flight / adjacent (do not duplicate)

| Id | Item | Status |
|---|---|---|
| `FEAT-configs-path-resolution-file-relative-windows-macos-parity` | config paths resolve against CWD, not the config file's dir | Not Started — blocks F1/F4 if paths are added |
| `BUG-chatformats-template-config-defined-but-unused-dead-standard` | `templates.llm.chatFormats` validated but never consumed | Wontfix |
| `TASK-wardrobe-*` (12 sub-tasks) | wardrobe epic | Done |
| backlog D3 | GM config type authoring | partial |
| backlog X2 | LLM provider adapter factory refactor | open |

## 6. Recommended next step

Land F1 (loadout seeding — unlocks the flag and the documented `loadouts[]`
contract) or F2 (validation, one call, removes a silent merge). F3/F4/F5 are
deferrable until one of those lands and the drift count is re-measured.

A bigger question the audit surfaces but does not answer: `configs/templates/`
carries four example domains (`llm`, `sd`, `avatar`, `image-edit`) plus
`expansion` that are fully loaded and validated, and one whole `expansion`
sub-tree that is validated, merged and then never read. Whether the answer is
"wire it up" or "trim the block" is a product call, not an audit call.
