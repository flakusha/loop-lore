<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Config examples and domain-file support for uncovered sections

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-config-file-separation

**Summary:**

src/config/load/constants.ts:23-38 lists 14 DOMAINS, and src/config/load/domain.ts:27-30 only reads config.`<domain>`.{yaml,yml,toml} for those names. src/config/sections/index.ts:9-38 exports 18 sections, so five have no per-domain config file: ageGate, assistant, cron, dynamicResponse, integrations.

They remain settable via the main config.yaml and via env vars (src/config/schema-class/env-map.ts), so this is a convenience gap rather than a functional one - but it is invisible and undocumented.

integrations is the notable case: it already has a generated schema mirror at schemas/config.integrations.schema.json and its own test (src/config/sections/integrations.test.ts), but no example file at all, making it the missing third of the section/schema/example pattern.

Add configs/config.integrations.example.{yaml,toml}, and extend DOMAINS to cover the five sections so per-domain files work uniformly.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
