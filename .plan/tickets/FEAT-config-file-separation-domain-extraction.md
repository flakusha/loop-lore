<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Config File Separation — Domain Extraction

**Status:** open
**Priority:** High
**Labels:** config, modularization, domain-separation
**Assignee:**
**Epic:** EPIC-2026-39 (Config File Separation)

## Description

Split the monolithic `configs/config.toml` into domain-specific config files in `configs/` folder. Each domain gets its own config file: server, database, assets, assistant, logging, tui, docs, auth, transport, messages, nsfw, generation, byoKey, encryption, headers.

## Features

- Extract [server], [server.tls] → `configs/config.server.toml`
- Extract [db] → `configs/config.database.toml`
- Extract [assets] → `configs/config.assets.toml`
- Extract [assistant], [generation] → `configs/config.assistant.toml`
- Extract [logging] → `configs/config.logging.toml`
- Extract [tui] → `configs/config.tui.toml`
- Extract [docs] → `configs/config.docs.toml`
- Extract [auth], [ageGate] → `configs/config.auth.toml`
- Extract [transport], [transport.compression], [transport.limits] → `configs/config.transport.toml`
- Extract [messages] → `configs/config.messages.toml`
- Extract [nsfw] → `configs/config.nsfw.toml`
- Extract [byoKey] → `configs/config.byokey.toml`
- Extract [encryption] → `configs/config.encryption.toml`
- Extract [headers], [headers.csp] → `configs/config.headers.toml`

## Acceptance Criteria

- [ ] All domains extracted to separate config files
- [ ] No functionality lost after split
- [ ] All existing tests pass

## Linked Epics

- `epic-config-file-separation.md`
