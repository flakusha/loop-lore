# TASK: Config Files for Gallery & File Attachment with Idempotent Load

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-config-extensions
**Tags:** config, gallery, file-attachment, idempotent, reload, asset

## Description

Add config file support for gallery/direct file attachment and server-restart idempotent load. Gallery config defines available asset galleries (image sets, audio sets, template sets). File attachment config defines allowed file types, size limits, and storage rules. Idempotent load ensures config files can be loaded multiple times without duplication or side effects.

## How It Extends Existing Work

Builds on the Configuration Extensions (ECE) epic's extensible enumeration system and the Config Templates epic's template system. Adds gallery config, file attachment config, and idempotent loading on top of the existing config infrastructure.

## Acceptance Criteria

- [ ] Gallery config file format (YAML/JSON defining available galleries)
- [ ] Gallery categories (images, audio, video, 3D models, templates, presets)
- [ ] Direct file attachment config (allowed types, size limits, storage paths)
- [ ] File attachment validation (type checking, size limits, virus scanning)
- [ ] File upload API (`POST /api/assets/upload` with config-driven validation)
- [ ] Gallery browsing UI (browse and select from configured galleries)
- [ ] Direct file attachment UI (drag-and-drop upload with preview)
- [ ] Server-restart idempotent load — config files load exactly once, no duplication
- [ ] Config file hot-reload — changes detected and applied without restart
- [ ] Config file versioning — track config changes across reloads
- [ ] `GET /api/config/galleries` — list available galleries
- [ ] `GET /api/config/attachments` — get attachment config
- [ ] Frontend gallery browser with search and filter
- [ ] Frontend file upload with progress and preview
- [ ] Frontend config reload status indicator

## Technical Notes

- Gallery config files stored in `config/galleries/` directory
- File attachment config stored in `config/attachments/` directory
- Idempotent load uses content hashing — same file hash = skip reload
- Hot-reload uses file watcher (chokidar or equivalent) to detect changes
- Config versioning stored in DB with `config_version` column
- Integrates with existing asset system (Epic: Asset Support Expansion)
- Integrates with ECE system for gallery categories as extensible enums
- Integrates with Config Templates epic for template-based gallery definitions
