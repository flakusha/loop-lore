<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Config File Separation — Per-Domain JSON Schemas

**Status:** open
**Priority:** High
**Labels:** config, schemas, validation
**Assignee:**
**Epic:** EPIC-2026-39 (Config File Separation)

## Description

Generate JSON Schema for each domain config file. Schemas live in `schemas/` directory and follow the naming pattern `config.<domain>.schema.json`.

## Schemas to Generate

- `schemas/config.server.schema.json`
- `schemas/config.database.schema.json`
- `schemas/config.assets.schema.json`
- `schemas/config.assistant.schema.json`
- `schemas/config.logging.schema.json`
- `schemas/config.tui.schema.json`
- `schemas/config.docs.schema.json`
- `schemas/config.auth.schema.json`
- `schemas/config.transport.schema.json`
- `schemas/config.messages.schema.json`
- `schemas/config.nsfw.schema.json`
- `schemas/config.byokey.schema.json`
- `schemas/config.encryption.schema.json`
- `schemas/config.headers.schema.json`
- `schemas/config.workflows.schema.json`

## Acceptance Criteria

- [ ] All domain schemas generated
- [ ] Each schema validates its domain config
- [ ] Schema generation is automated (from `src/config/schema.ts`)

## Linked Epics

- `epic-config-file-separation.md`
