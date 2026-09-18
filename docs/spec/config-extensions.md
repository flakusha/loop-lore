<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Configuration Extensions Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

Configuration extensions support closed-but-extensible value sets: a default value list ships with the app, users can add custom entries via plugin system or TOML config. Implementation rides on `src/config/schema.ts` (JSON Schema for config) and the plugin loader at `src/plugins/`.

## Scope

- Config validation via JSON Schema (`scripts/config-generate-schema.ts` produces the schema).
- Plugin-contributed config values flow through `src/plugins/` registry.
- TOML merging via `src/config/templates-loader.ts`.

## Technical Design

- **Schema source:** `src/config/generate-schema.ts` + `src/config/generate-character-schema.ts` + `src/config/generate-toml-schema.ts` emit JSON Schema definitions.
- **Validation:** `src/config/schema-class.ts` validates incoming config against the schema; failures surface as schema-validator errors.
- **Extension path:** plugins can extend config schemas via `src/plugins/` `extends: { config: ... }`.

## Integration Points

- `src/config/` — schema generation + validation
- `src/plugins/` — extension registry
- `scripts/config-generate-schema.ts` — schema emitter

## Related Epics

- `.plan/epics/epic-config-extensions.md`
- `.plan/epics/epic-plugin-system.md`
