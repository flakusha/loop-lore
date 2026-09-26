<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Adopt Bun.YAML to replace js-yaml

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🟡 Deferred (lean-ctx gap; `adopt-bun-features` commit `255ef74c`)
**Priority:** low
**Effort:** Medium

## Summary

Replace js-yaml npm package with Bun.YAML.parse(). Already partially used in config. Standardize all YAML parsing.

## Acceptance Criteria

- [ ] Implementation complete (BLOCKED on Bun issue #39959)
- [ ] Tests passing
- [x] Documentation updated (deferral note added to `src/characters/exporters/yaml.ts` and `src/characters/parser.ts`)

## Deferred blocker (2026-08-27)

The round-trip is gated on Bun shipping a `lineWidth` knob for `Bun.YAML.stringify`:

- `src/characters/exporters/yaml.ts` emits multi-line block-style scalars (description, personality, scenario, system_prompt, mes_example, etc.) and requires `lineWidth: -1` to avoid wrapping that would be unstable to test.
- `Bun.YAML.stringify` currently lacks `lineWidth`. Long scalars are emitted on a single line and the only knob is `indent` (block-style vs flow-style).
- Tracked at https://github.com/oven-sh/bun/issues/39959 (open as of 2026-08-21).
- `js-yaml` is kept in `package.json`; both `parser.ts` and exporter deferred together so the parser/serializer pair stays symmetric.

Re-evaluate when the issue closes (or when Bun adds a block-style multiline option).


## Verification 2026-09-26

Verdict: **still-open-expanded** (deferral still valid; adoption is halfway — parse migrated in 6 places, character round-trip still on js-yaml).

Src checked:
- `src/characters/parser.ts:7-13` + `src/characters/exporters/yaml.ts:9-21` — deferral notes intact, still `import { load/dump } from "js-yaml"`; blocker `oven-sh/bun#39959` (`Bun.YAML.stringify` lacks `lineWidth`, breaks multi-line block scalars) unchanged per ticket.
- Already on `Bun.YAML.parse`: `src/chat/service/templates.ts:54`, `src/config/character-loader.ts:120`, `src/config/migrate-config.ts:83`, `src/config/load/parse.ts:85`, `src/config/template-expansion/discovery.ts:54`, `src/config/templates-loader/discovery.ts:122`. `js-yaml` retained in `package.json` for the character pair + `src/admin/config.ts:12` + `src/chat/export/formats.ts:22`.
- Parser/serializer symmetry argument (defer both together) still holds — no partial swap observed.

Refreshed deltas:
- None on the blocker; re-evaluate only when upstream ships `lineWidth`/block-style-multiline. If Bun closes the issue as wont-fix, the follow-up is: keep js-yaml for character cards, finish `Bun.YAML.parse` everywhere else, and close this ticket as "adopted except character round-trip" with the exception documented in the two files above.
