# Epic: Config File Separation

**Status:** ✅ Complete
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** config, modularization, schemas, domain-separation, extensibility

## Overview

Split the monolithic `config.toml` / `config.yaml` into domain-specific config files in `configs/` folder, each with its own JSON schema. This enables per-domain configuration, easier extension, and better validation.

## Current State

Single `configs/config.toml` and `configs/config.yaml` contain all domains: server, db, assets, assistant, logging, tui, docs, auth, ageGate, transport, messages, nsfw, generation, byoKey, encryption, headers.

## Target State

```
configs/
├── config.server.toml        # server, tls ✅
├── config.database.toml      # db ✅
├── config.assets.toml        # assets ✅
├── config.logging.toml       # logging ✅
├── config.tui.toml           # tui ✅
├── config.docs.toml          # docs ✅
├── config.auth.toml          # auth, ageGate ✅
├── config.transport.toml     # transport, compression, limits ✅
├── config.messages.toml      # messages ✅
├── config.nsfw.toml          # nsfw ✅
├── config.generation.toml    # generation, llm-templates ✅
├── config.byokey.toml        # byoKey ✅
├── config.encryption.toml    # encryption ✅
├── config.headers.toml       # headers, csp ✅
├── schemas/
│   ├── config.server.schema.json ✅
│   ├── config.database.schema.json ✅
│   ├── config.assets.schema.json ✅
│   ├── config.logging.schema.json ✅
│   ├── config.tui.schema.json ✅
│   ├── config.docs.schema.json ✅
│   ├── config.auth.schema.json ✅
│   ├── config.transport.schema.json ✅
│   ├── config.messages.schema.json ✅
│   ├── config.nsfw.schema.json ✅
│   ├── config.generation.schema.json ✅
│   ├── config.byokey.schema.json ✅
│   ├── config.encryption.schema.json ✅
│   └── config.headers.schema.json ✅
└── characters/               # existing character configs
└── templates/                # existing template configs
└── workflows/                # existing workflow configs
```

## Features

| Feature                             | ID           | Effort | Description                                          | Status  |
| ----------------------------------- | ------------ | ------ | ---------------------------------------------------- | ------- |
| Domain config file extraction       | FEA-2026-073 | High   | Split config.toml into domain files                  | ✅ Done |
| Per-domain JSON schema generation   | FEA-2026-074 | High   | Generate schemas for each domain config              | ✅ Done |
| Config loader with domain merging   | FEA-2026-075 | Med    | Load and merge domain configs                        | ✅ Done |
| Backward compatibility layer        | FEA-2026-076 | Med    | Support old monolithic config format                 | ✅ Done |
| Config validation per domain        | FEA-2026-077 | Med    | Validate each domain config against schema           | ✅ Done |
| Config hot-reload per domain        | FEA-2026-078 | Low    | Reload individual domain configs without restart     | ✅ Done |
| Migration from monolithic to domain | FEA-2026-079 | Med    | Tool to split existing config.toml into domain files | ✅ Done |

## Acceptance Criteria

- [x] All domains extracted to separate config files
- [x] JSON schema for each domain config exists in `schemas/`
- [x] Config loader merges domain configs correctly
- [x] Backward compatibility with monolithic config works
- [x] Each domain config validates against its schema
- [x] Hot-reload works per domain
- [x] Migration tool splits existing config.toml
- [x] All existing functionality preserved

## Dependencies

- `src/config/load.ts` — config loading
- `src/config/schema.ts` — schema generation
- `schemas/` — schema output directory
