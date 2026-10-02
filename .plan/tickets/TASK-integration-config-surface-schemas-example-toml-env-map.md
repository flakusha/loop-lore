<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Integration config surface: schemas, example toml, env map

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-integrations-core

**Summary:**

Adopted component: ground-up (config only). Seam: src/config/sections/integrations.ts + schemas/config.integrations.schema.json + configs/config.example.toml + configs/env.example.yaml + src/config/schema-class/env-map.ts. Adds [integrations] master switch plus per-family sections (email/matrix/xmpp/telegram/discord/nostr) with secrets marked sensitive; env overrides flatten to UPPER_SNAKE. Rule: cold start with an integration unconfigured imports zero integration libs (optional peer deps + dynamic import). AC: config loads with all integrations disabled by default; enabling a family without its libs installed fails with a typed not-configured error; env vars override file values; docs/spec/integrations-architecture.md §8 updated. Epic: epic-integrations-core.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
