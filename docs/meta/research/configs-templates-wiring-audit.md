<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# configs/templates wiring audit

Scope: `configs/` example configs vs their loaders in `src/config/`. Every claim
below is cited to `file:line` and was verified against the code at the time of
writing.

## 1. The example files are not wired to anything

`configs/templates/` ships seven domains as `*.example.yaml` + `*.example.toml`:
avatar, character, chat-setup, expansion, image-edit, llm, sd. The template
loader discovers templates by **bare name only** —

- `src/config/templates-loader/discovery.ts:12-28` maps `avatar.yaml|yml|toml`,
  `character.yaml|yml|toml`, `image-edit.yaml|yml|toml`, `llm.yaml|yml|toml`,
  `sd.yaml|yml|toml`.
- `src/config/template-expansion/discovery.ts:11-15` maps
  `expansion.yaml|yml|toml`.
- `src/chat/service/templates.ts:88` looks for `chat-setup.yaml|yml|toml`.

No file under `src/` contains the string `.example.yaml`, `.example.yml`, or
`.example.toml`. `.gitignore:63-66` whitelists exactly those example files, so
they are intentionally documentation, not live config. A user must rename the
file to the bare domain name for it to take effect.

The one exception is `configs/templates/workflows/`, which is read by directory
glob (`src/config/templates-loader/discovery.ts:84-112`) rather than a fixed
name — `defaults.yaml`, `entities.yaml`, and `entity-types.yaml` all load.

`configs/workflows/*.json` is a different path entirely: `seedWorkflowLibrary`
(`src/generation/workflow-library/seed.ts:133`) reads those files on boot and
INSERTs them into the `prompt_templates` table.

Consequence: the examples drift from the code with **nothing to catch it**.
There is no test, script, or gate that parses an example file against its
schema. See finding 2 for the bug that survived exactly this way.

## 2. content_rating: the validator rejects every legal value

**Fixed in this branch** (`config-template-validator-fix`).

Three sources declare one vocabulary; a fourth disagreed:

| Location | Values |
| --- | --- |
| `src/config/sections/templates.ts:205` | `sfw`, `nsfw_mild`, `nsfw_moderate`, `nsfw_intense`, `nsfw_extreme` |
| `src/config/sections/characters/section.ts:78` | same five |
| `src/config/schema-class/json-schema/templates.ts:168` | same five |
| `src/characters/validator/constants.ts:47-53` | same five, built from the `ContentRating` enum |
| `src/config/templates-loader/validation-domains.ts:10` (before) | `sfw`, `questionable`, `explicit` |

`validateCharacterConfig` is on the load path
(`src/config/templates-loader/index.ts:116`), so any character template setting
`content_rating: nsfw_mild` threw `TypeError` at load. `questionable` and
`explicit` — values the type does not allow — passed validation. `sfw` was the
only rating that satisfied both.

Fix: the validator now uses `VALID_CONTENT_RATINGS` from
`src/characters/validator/constants.ts` instead of its own literal, so the
vocabulary has one source. The value import `config -> characters` is safe:
every existing `characters/* -> config/*` import is type-only, and
`src/config/generate-character-schema/data-core.ts:7` already value-imports
`ContentRating` from `../characters/spec`.

## 3. chat-setup silently discards user input

`src/chat/service/templates.ts:104-123` converts each raw entry:

- `gmConfig` is never read from the file. Line 117 derives it entirely from the
  `visualNovel` boolean, so a user-authored `gmConfig` is dropped without a
  warning.
- `worldId` is never read at all; `src/chat/service/types.ts:73` declares
  `world_id` on the runtime type, so the capability exists but is unreachable
  from config.
- `visualNovel` itself is consumed to build `gmConfig` and is not stored.

These are silent losses, not crashes — lower severity than finding 2, but they
are the kind of thing a config example should not advertise if it cannot
honour it.

## 4. avatar outfits are documented but unwired

`configs/templates/avatar.example.yaml:66-98` documents an `outfits:` block and a
`default_outfit:` key (both commented out) for the wardrobe/avatar-variant
epic. `src/config/templates-loader/` contains **zero** occurrences of
`outfit` — `AvatarTemplateConfig` (`src/config/sections/templates.ts:137-143`)
is `merge`, `emotions`, `intentPatterns` only. Uncommenting the block produces
keys that are silently ignored.

The wardrobe fields do exist on the *character* domain, where they are wired:
`default_outfit`, `outfits`, `loadouts` at
`src/config/sections/templates.ts:210-212`. So the avatar-domain copy is
premature rather than wrong.

## 5. Config sections with no domain-file support

`src/config/load/constants.ts:23-38` lists 14 `DOMAINS`. `src/config/load/domain.ts:27-30`
only reads `config.<domain>.<yaml|yml|toml>` for those names.
`src/config/sections/index.ts:9-38` exports 18 sections. The sections with no
per-domain config file:

- `ageGate`
- `assistant`
- `cron`
- `dynamicResponse`
- `integrations`

These are still settable through the main `config.yaml` and via env vars
(`src/config/schema-class/env-map.ts:46,60,62,84,96,98,100`), so this is a
convenience gap rather than a functional one — but it is invisible and
undocumented.

`integrations` is the notable case: it has a generated JSON Schema mirror at
`schemas/config.integrations.schema.json` and its own test
(`src/config/sections/integrations.test.ts`), yet **no example file at all**.

Sections with defaults but no example file anywhere: `age-gate`, `assistant`,
`cron`, `dynamic-response`, `integrations`, `autonomy`, plus the
`schema-class/` sections `hooks`, `idempotency`, `federation`, `seeding`,
`observability`.

## 6. Smaller items

- `configs/config.mcp.example.toml` is referenced as a deliverable in
  `docs/meta/research/harness-mcp-wiring.md:137` and `:220`, but the file does
  not exist.
- `configs/templates/` has no README. `configs/assets/README.md` documents its
  own placeholder images well; the template domain has nothing equivalent.
- Schema capabilities with no example line: `appearance` and `system_prompt` on
  character templates (`src/config/sections/templates.ts:197,200`), and
  `emotions.<key>.prompt` on the avatar template
  (`src/config/sections/templates.ts:125`).
- `configs/templates/expansion.example.yaml` lists `stare` twice in `keywords`
  (lines 23 and 69).
- `expansion.example.yaml` ships 56 `keywords` and ~86 `actions`, but
  `expandAvatarConfig` returns an `AvatarTemplateConfig` containing only
  `emotions` and `intentPatterns`. The keyword/action lists are read and counted
  into `ExpansionResult` for logging (`src/config/template-expansion/run.ts:64-70`)
  and never reach any config object. The example advertises 142 entries that do
  nothing.

## Candidates, ranked

1. **Add a gate that every `configs/**/*.example.*` parses and matches its
   schema.** This is the root fix for the whole class. It caught nothing here,
   which is why finding 2 survived; finding 4, 5, 6, and the `stare` duplicate
   would all be caught by it. Cheapest entry point: extend
   `src/config/templates-loader.test.ts`, which already has `writeTemplateFile`
   scaffolding, or add a standalone test that loads each example into the real
   `loadTemplateConfig` against the committed schema.
2. **Fix the chat-setup `gmConfig` / `worldId` loss**, or delete both keys from
   the example until they are honoured.
3. **Add `configs/config.integrations.example.{yaml,toml}`** — the schema mirror
   and test already exist; the example is the missing third of the pattern.
4. **Extend `DOMAINS`** to cover `ageGate`, `assistant`, `cron`,
   `dynamicResponse`, and `integrations` so per-domain files work uniformly.
5. **Either wire avatar `outfits`/`default_outfit` or drop the block** from
   `avatar.example.yaml` until the wardrobe epic lands.
6. **Add `configs/templates/README.md`** stating the rename-to-activate rule
   once, at the top of the directory.

## See also

`src/config/templates-loader/`, `src/config/template-expansion/`,
`src/config/sections/`, `src/chat/service/templates.ts`,
`.plan/epics/epic-wardrobe-avatar-variants.md`,
`docs/meta/research/harness-mcp-wiring.md`.
