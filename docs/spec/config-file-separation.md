# Config File Separation Specification

> **Status:** Implemented — domain config files active
> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

## Overview

Specification for Config File Separation. See `.plan/epics/epic-config-file-separation.md` for epic details.

## Scope

Split the monolithic `config.toml` / `config.yaml` into domain-specific config files in `configs/` folder, each with its own JSON schema.

## Technical Design

### Domain Config Files

Domain config files are stored in `configs/` directory with naming pattern `config.<domain>.toml`:

| Domain | File | Config Paths |
|--------|------|--------------|
| server | `config.server.toml` | `[server]`, `[server.tls]` |
| database | `config.database.toml` | `[db]` |
| assets | `config.assets.toml` | `[assets]` |
| logging | `config.logging.toml` | `[logging]` |
| tui | `config.tui.toml` | `[tui]` |
| docs | `config.docs.toml` | `[docs]` |
| auth | `config.auth.toml` | `[auth]`, `[ageGate]` |
| transport | `config.transport.toml` | `[transport]` |
| messages | `config.messages.toml` | `[messages]` |
| nsfw | `config.nsfw.toml` | `[nsfw]` |
| generation | `config.generation.toml` | `[generation]` |
| byokey | `config.byokey.toml` | `[byoKey]` |
| encryption | `config.encryption.toml` | `[encryption]` |
| headers | `config.headers.toml` | `[headers]` |

### Config Loading Order

1. `config.default.*` — team-shared defaults (committed to git)
2. `config.*` — main config file (monolithic, backward compatible)
3. **Domain config files** — `configs/config.<domain>.toml` (new)
4. `config.local.*` — per-developer overrides (gitignored)
5. `env.*` — environment-specific overrides
6. Environment variables — highest priority

### JSON Schemas

Each domain has its own JSON schema in `schemas/`:

- `schemas/config.server.schema.json`
- `schemas/config.database.schema.json`
- `schemas/config.assets.schema.json`
- `schemas/config.logging.schema.json`
- `schemas/config.tui.schema.json`
- `schemas/config.docs.schema.json`
- `schemas/config.auth.schema.json`
- `schemas/config.transport.schema.json`
- `schemas/config.messages.schema.json`
- `schemas/config.nsfw.schema.json`
- `schemas/config.generation.schema.json`
- `schemas/config.byokey.schema.json`
- `schemas/config.encryption.schema.json`
- `schemas/config.headers.schema.json`

### Implementation

**Source files:**
- `src/config/load.ts` — `loadDomainConfigs()` function
- `src/config/generate-domain-schemas.ts` — schema generation script

**Tests:**
- `src/config/domain-configs.test.ts` — domain config loading tests

## Integration Points

- Backward compatible with monolithic `config.toml` / `config.yaml`
- Domain configs override main config but can be overridden by local config
- Environment variables still highest priority

## Related Epics

- `.plan/epics/epic-config-file-separation.md`
