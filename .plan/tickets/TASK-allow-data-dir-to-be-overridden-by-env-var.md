<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Allow DATA_DIR to be overridden by env var

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

DATA_DIR (src/config/constants.ts:13) is a hardcoded path.resolve(__dirname, '..', '..', 'loop-lore-data'). Every section default hangs off it - database.sqliteFilename (src/config/sections/database.ts:11), assets.uploadDir (src/config/sections/assets.ts:10), server.tls key/cert (src/config/sections/server.ts:16-19) - so two local instances cannot get distinct state without setting three separate per-var overrides, and TLS paths have no override at all. Read DATA_DIR from env with the current path as the default. Acceptance: DATA_DIR=/tmp/ll-b relocates db, uploads, and certs for that process; with DATA_DIR unset the resolved default is byte-identical to today; the JSON-schema placeholder rewrite (src/config/schema-class/json-schema/index.ts:36-47) still emits ${DATA_DIR} placeholders.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
