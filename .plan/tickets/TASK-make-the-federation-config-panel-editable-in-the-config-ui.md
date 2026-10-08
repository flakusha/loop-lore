<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Make the federation config panel editable in the config UI

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Map the `federation` section into `EDITABLE_KEY_MAP` so its config inputs render enabled instead of disabled.

**Context:**

`EDITABLE_KEY_MAP` (`src/config/sections/menu-data.ts:11-24`) maps exactly three sections — `auth`, `assets`, and `generation`. `federation` is absent, so every input on the federation panel renders disabled and operators must hand-edit TOML to change `enabled`, `seeds`, `peers`, or `duplication`.

The field metadata this needs already exists. The published JSON Schema describes the whole section including `enabled`, `seeds`, `peers`, and `duplication` (`src/config/schema-class/json-schema/federation.ts`), and the TypeScript types are defined at `src/config/schema/federation.ts:41-52`. Only the editable mapping is missing, which makes this a small, well-bounded change.

One field must stay out of scope. `meshPsk` is env-only by design — `src/config/schema/federation.ts:48` documents it as such — because a mesh PSK written to the config table is a secret that would end up readable through a UI that has no secret-field affordance.

**Direction:**

1. Add a `federation` entry to `EDITABLE_KEY_MAP` covering `enabled`, `seeds`, `peers`, and `duplication`.
2. Deliberately exclude `meshPsk`; it remains env-only via `MESH_PSK`.
3. Confirm the panel renders enabled inputs for the mapped keys and a disabled field for `meshPsk`.
4. Confirm a saved value round-trips through the existing `system_config` write path and reads back after reload.
5. Check the duplication sub-object shape (it nests per-world overrides) renders sensibly; if it does not fit the existing field widgets, say so and scope it down explicitly rather than forcing it.

**Acceptance Criteria:**

- [ ] The federation panel renders editable inputs for `enabled`, `seeds`, `peers`, and `duplication`
- [ ] `meshPsk` remains non-editable in the UI and env-only
- [ ] A saved value round-trips through the config write path and survives a page reload
- [ ] Disabled-by-default gating is unchanged — federation stays off until explicitly enabled
- [ ] Existing config panels render and save unchanged
- [ ] `bun run check` green

**Dependencies:**

- `TASK-add-federation-to-the-config-domains-list-so-config-federati.md` — editing the panel is pointless while the domain file is ignored on load

**Out of Scope:**

- An admin peer list UI (`epic-frontend-admin.md`, `TASK-federation-admin-ui-for-follows-blocklists-key-rotation.md`)
- Exposing `meshPsk` or any other secret through the config UI
- Changing the `federation` JSON Schema shape
