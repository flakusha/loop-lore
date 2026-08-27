# TASK: Adopt Bun.YAML to replace js-yaml

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
