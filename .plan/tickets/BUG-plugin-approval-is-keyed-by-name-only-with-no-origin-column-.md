<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Plugin approval is keyed by name only with no origin column: a community plugin inherits a core plugin's approval

**Status:** Not Started
**Priority:** critical
**Effort:** Medium
**Epic:** epic-plugin-system

**Summary:**

Location: src/plugins/loader.ts:294-297 (approval select by name), :272-275 (onConflict column(name).doNothing), src/plugins/registry.ts:33-36 (plugins.set(name, plugin) silent replace), src/db/migrations/001_init.ts:139-141 (plugin_state.name is the sole PK, no origin column).

Evidence: drop a directory under plugins/community/ whose manifest declares the name of an existing core plugin. isPluginActive reads the core row's active flag, persistPluginState's insert no-ops on the name conflict, and register() silently replaces the core plugin - the community plugin runs onLoad (arbitrary code with a live db handle) with no admin approval.

Verification: REPRODUCED (registry half) + CODE-READ (DB half). Probe .tmp/glm-review/verify/registry-overwrite.ts drives the real registry singleton: decisive output 'before.origin = core | after.origin = local | listPlugins().length = 1' - silent replacement, no error. DB half trace: loader.ts:294-298 (select where name = ?) -> :272-275 (onConflict on name) -> 001_init.ts:140 (name text PRIMARY KEY, no origin column).

Impact: approval bypass for untrusted plugin code on any host that loads community/local plugin dirs.

Fix (spans a schema migration): append a new forward migration adding an origin column to plugin_state (append-only policy: new top-level NNN_*.ts migration, never edit 001_init), match approval on (name, origin), and reject duplicate manifest names across origins at load instead of silently replacing. Duplicate-name ordering also decides shutdown (onUnload fired twice via loadOrder) and route ACL (first-match-wins in fixed core->community->local order) - reject duplicates covers that too.

Related: BUG-a-community-plugin-named-core-disables-all-five-built-in-too (a06afc7, open) tracks the unapproved-core-disables-builtins symptom; this ticket covers the approval-inheritance bypass and the silent core replacement.

Source: .tmp/glm-review/deep-plugins-1015.md F-2 + F-6; prior-findings-status-1015.md R2-plugins-H5 (reports gitignored; findings recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
