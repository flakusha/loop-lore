<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: O(1) plugin route dispatch index

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-plugin-system
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

gap-audit E6 (epic-plugin-system): dispatchPluginRoute (src/plugins/loader.ts:408) linearly scans registry.getEnabledRoutes() per request — O(n) over all plugin routes. Add a method+normalized-path -> ordered-candidates index in RegistryStore (src/plugins/registry-store.ts) maintained at mutation points (appendRoutes/removePlugin/clear), and make dispatch an O(1) lookup that picks the first ENABLED candidate at dispatch time. findRoute keeps its own first-registered contract untouched; normalizePluginRoutePath semantics unchanged.

**Context:**

Why: every plugin-routed request pays an O(n) scan over ALL enabled plugin
routes (`registry.getEnabledRoutes()` in `dispatchPluginRoute`,
src/plugins/loader.ts:408). Routes match on exact method + normalized path,
so a `Map<"METHOD path", candidates>` makes dispatch O(1).

Semantics crux (verified): the current loop resolves the FIRST **enabled**
route matching method + normalized path, NOT the first registered route.
`RegistryStore.findRoute` (registry-store.ts:88) deliberately ignores enabled
state and returns first-registered for its own callers (duplicate-warning
lookup) — its contract must NOT change. A naive key→def map would flip
winners when an earlier-registered plugin is disabled: therefore the index
maps each key to the ORDERED candidate list in registration order
(plugin-grouped, exactly the order `enabledDefinitions` scans), and dispatch
walks the (usually 1-element) bucket skipping disabled candidates —
enablement is consulted at dispatch time, so runtime `setEnabled` flips are
honored without index churn. Candidates stay in the map while a plugin is
disabled; only `appendRoutes`/`removePlugin`/`clear` mutate the index.

Constraints: index stays private to RegistryStore; normalization stays
`normalizePluginRoutePath` on both registration and dispatch sides
(BUG-fix-plugins-define-plugin-route-matching-semantics); append semantics of
`appendRoutes` preserved (BUG-fix-plugins-append-onload-registrations…: a
plugin's onLoad routes must not replace manifest routes, and a late append
must still win over a LATER-registered plugin's same-key route because
plugin-grouped order beats global append order). Alternatives considered:
per-plugin route maps with flat-map on dispatch (still O(n)); caching the
enabled flat list with invalidation on setEnabled (spreads enablement
invalidation across the store — more invasive than candidates-at-dispatch).

**Acceptance Criteria:**

- [x] Implementation complete — `RegistryStore.routeIndex` (private
      `"METHOD path"` → ordered candidates, plugin-grouped registration order)
      maintained at every routes mutation point (`appendRoutes`,
      `removePlugin`, `clear`) via `reindexRoutes()`; `registry.getRouteCandidates`
      exposes the read-only lookup; `dispatchPluginRoute` (src/plugins/loader.ts:408)
      now does an O(1) bucket lookup and picks the first ENABLED candidate at
      dispatch time. `findRoute`'s first-registered contract and
      `normalizePluginRoutePath` semantics unchanged. Commit `cdb751135` on
      `feat-plugin-route-index`.
- [x] Tests passing — pre-index pin run: 16 pass / 0 fail
      (src/plugins/loader-dispatch.test.ts); post-change full plugin suites:
      166 pass / 0 fail across 13 files (src/plugins/). New "O(1) route dispatch
      index" tests pin first-enabled-wins across disable/re-enable,
      manifest+onLoad append coexistence, plugin-grouped ordering beating global
      append order, method+path miss correctness, trailing-slash normalization
      parity. Gates `typecheck - backend`, `lint - eslint`, `format - dprint`: PASS.
- [x] Documentation updated — epic-plugin-system.md gap-audit E6 box ticked
      with evidence; `plan gen-docs` + `plan links --write` + `sync` rerun in
      the worktree.
