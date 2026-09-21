<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Artifacts System Specification

Status: UNSCOPED + aspirational — no owning epic, zero implementation in `src/` (no artifact service, tables, or routes; the only "artifact" matches are RPG item rarity and build-minify wording). Several original sections were empty headers.

## Design content (compressed — nothing built)

- Extends the assets system to non-media outputs: code, documents, data, notebooks, config, build/dependency files — still polymorphic via `asset_links` to any entity (epics, tasks, agents, users).
- vs media assets: smaller, frequently versioned, executable, edited in-context (media = large, external-tool edited, passive).
- Proposed per-type label vocabularies (e.g. code: source/script/module/test/fixture; data: dataset/fixture/migration/seed; config: config/secrets/template; build: manifest/lockfile).
- Proposed API: `POST /api/assets/{code,document,data}`, enhanced metadata, sandboxed `execute`, `query`, `transform`, `preview` under `/api/assets/:id/...`.
- Proposed UI: universal viewer (auto-detect), Monaco code editor, markdown/PDF viewer, data explorer (grid + SQL), notebook interface, config editor with secret masking.
- Security requirements: execution sandboxing (process isolation, seccomp-bpf, filesystem chroot), malware scanning, secret detection, size limits, inherited permissions + explicit sharing + audit logging.

## Epics

- None — never scoped. Asset substrate it would build on: `.plan/epics/epic-asset-platform-capabilities.md`; sandboxing overlap: `.plan/epics/epic-security-sandboxing.md`.
