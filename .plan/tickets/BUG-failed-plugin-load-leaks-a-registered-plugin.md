<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Failed plugin load leaks a registered plugin

**Status:** Not Started
**Priority:** high
**Epic:** epic-plugin-system
**Effort:** Medium

**Summary:**

**Problem.** `loadSinglePlugin` registers the plugin and its manifest extensions *before* `onLoad`, catches any failure from `onLoad`, and returns normally. The plugin stays in the registry with all of its routes, tools, roles, UI components, and event handlers live, while `onUnload` is never called — it was never added to `loadOrder`, so the shutdown loop cannot reach it either.

**Evidence.** `src/plugins/loader.ts:135-180`:

```ts
export async function loadSinglePlugin(...) {          // :135
  const mod = await import(pluginFile);                // :146
  registry.register({ manifest, origin, directory });   // :153  <-- registered
  registerManifestExtensions(manifest);                 // :154  <-- routes/tools/roles live
  if (typeof manifest.onLoad === "function") {
    await manifest.onLoad({ ... });                    // :161-171 <-- throws here
  }
  loadOrder.push(manifest.name);                       // :174  <-- never reached
  ...
} catch (error) {
  log.error({ message: `Failed to load plugin`, ... });  // :177-179  <-- swallowed
}
```

Registration at `:153-154` is not rolled back in the `catch` at `:177-179`. `unloadAllPlugins` (`src/plugins/loader.ts:257`) iterates `loadOrder` only, and `:174` never ran, so the half-loaded plugin is unreachable from shutdown too. `registry.unregisterAll` at `:269` is the only thing that clears it.

**Impact.** A plugin whose `onLoad` throws is live in production with a partially-initialized state and no way to unload it. Since route access control is now load-bearing (`src/plugins/loader.ts:241`), a half-registered plugin can expose routes that its `onLoad` never finished configuring. This is also the direct prerequisite blocker for hot reload: attempting a reload that throws makes the situation worse, not better.

**Fix direction.** Roll back registration in the `catch`: unregister the plugin and remove whatever `registerManifestExtensions` / `onLoad` already added, so a failed load leaves the registry byte-identical to its pre-load state. Pair with a per-plugin unload (the unload work is filed separately) rather than reusing the global `unregisterAll` — calling the global clear on one plugin's failure would tear down every *other* plugin too.

**Verification.** A plugin whose `onLoad` throws leaves no routes, tools, agent roles, UI components, or event handlers registered, and appears in neither the registry nor `loadOrder`.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
