<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Config File Separation Specification

Status: Implemented — domain config files active. Epic: `.plan/epics/epic-config-file-separation.md` (authoritative for details).

## Implemented

- Monolithic `config.toml`/`config.yaml` split into per-domain files in `configs/` named `config.<domain>.toml`: server (`[server]`, `[server.tls]`), database (`[db]`), assets, logging, tui, docs, auth (`[auth]`, `[ageGate]`), transport, messages, nsfw, generation, byokey (`[byoKey]`), encryption, headers.
- Loading order (lowest → highest): `config.default.*` (committed) → `config.*` (monolithic, backward compatible) → domain files `configs/config.<domain>.toml` → `config.local.*` (gitignored) → `env.*` → environment variables.
- Each domain has a JSON schema in `schemas/` (`config.<domain>.schema.json`).
- Source: `loadDomainConfigs()` in `src/config/load.ts`; schema generator `src/config/generate-domain-schemas.ts`; tests `src/config/domain-configs.test.ts`.

## Notes

- Domain configs override the monolithic file; local config and env vars still override them.

## Epics

- `.plan/epics/epic-config-file-separation.md` (Complete)
