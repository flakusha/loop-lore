<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Plugin state is auto-approved on first sight

**Status:** Done
**Priority:** high
**Epic:** epic-plugin-system
**Effort:** Medium

**Summary:**

**Problem.** `persistPluginState` inserts a `plugin_state` row with status hardcoded to `"active"` the first time it sees any plugin name. Approval is therefore not a decision — it is a side effect of the name being absent from the table. Since origin is path-derived, any plugin dropped into a scanned directory becomes active on first load.

**Evidence.** `src/plugins/loader.ts:201-211`:

```ts
async function persistPluginState(db, name): Promise<void> {          // :201
  try {
    await db.insertInto("plugin_state")
      .values({ name, status: "active", enabled_at: new Date().toISOString() })  // :205
      .onConflict((oc) => oc.column("name").doNothing())             // :206
      .execute();
  } catch { /* Persisting plugin state is best-effort */ }             // :197-199 swallow
}
```

- `:205` — `status: "active"` is a literal, not a parameter. No caller can influence it.
- `:206` — `doNothing` means a later load never re-evaluates an existing row, so this fires exactly once per new name and then never again.
- Called from `src/plugins/loader.ts:165`, immediately after a successful load, before any approval could have occurred.
- `src/plugins/loader.ts:33` `PLUGIN_DIRS` derives `origin` from the directory the plugin was found in — so a directory drop is enough to reach this path.
- The whole function is wrapped in a bare `catch` (`:197-199`), so a failure here is silent.

**Impact.** There is no meaningful deny path: a plugin cannot start unapproved, so an operator cannot require approval before a `community`- or `local`-origin plugin runs. This compounds the load-failure leak and the unenforced origin tier — three of them share the root cause that nothing asks whether a plugin *should* be running.

**Fix direction.** Require explicit approval for non-core origins: only `core` may self-insert as `active`; `community` and `local` should land as a pending/disabled state and be enabled by an explicit admin action, which also gives the origin work a real enforcement point. Drop the blanket `catch` swallow, or at minimum log it — a silent failure here means the approval state is not what the caller thinks it is.

**Verification.** A `marketplace`/`community`-origin plugin with no pre-existing `plugin_state` row loads in a non-active state and its routes do not dispatch; a `core` plugin is unaffected.

**Context:**

`persistPluginState` takes the origin and writes `disabled` for `community` /
`local`; `isPluginActive` reads the persisted row during `loadSinglePlugin` and
sets the in-memory flag, falling back to the origin default when no row exists.
No migration was needed: `plugin_state.status` is a plain TEXT column (no CHECK
/enum) and `PluginStatus` already carries `disabled` — the same value the admin
disable route writes. The admin enable/disable routes flip `registry.setEnabled`
in memory, so enabling a pending plugin takes effect without a restart.

**Adversarial review found two blocking holes in the above; both are closed.**

*Approval could still be decided by a config write.* `writeStoredPluginConfig`
inserted a brand-new `plugin_state` row with a hardcoded `status: Disabled`. Since
`persistPluginState` is best-effort, a `core` plugin could be left with no row at
all (a failed insert), and the next admin config write would create that row
disabled — permanently switching the core plugin off on the following boot, with
no operator action. The writer now takes the loaded plugin's `origin` and inserts
`defaultPluginStatus(origin)` — the same rule the loader applies — exported from
`config-store` so both writers share one definition. **A config write never
decides approval**: it only reproduces the origin default when it has to create
the row, and never touches the status of a row that already exists. The invariant
is stated in the function's own doc comment.

*Unapproved plugins still executed.* `setEnabled` gated only the registry
surface; `registerManifestExtensions` ran unconditionally and `onLoad` was gated
on `typeof manifest.onLoad === "function"` alone. A `disabled` `community`/`local`
plugin therefore ran its `onLoad` on every boot with a live `db` handle —
arbitrary writes, migrations prep, network — merely unserved. That is the
supply-chain case this ticket exists to close, and it contradicted the Impact
note above ("a plugin cannot start unapproved"): it still *started*. `onLoad` now
runs only for an approved plugin. The loader's `initializePlugin` is exported so
the admin enable route performs the deferred initialization rather than leaving
a permanently half-registered plugin; enable therefore still needs no restart.
A hook that throws at enable time leaves the plugin disabled and returns 500,
matching the loader's own load rollback. Statically declared extensions stay
registered but unreadable while disabled (the registry filters every read by
enabled state), so an unapproved plugin serves nothing.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
