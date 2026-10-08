<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Plugin hot reload with real module cache busting

**Status:** Not Started
**Priority:** medium
**Epic:** epic-plugin-system
**Effort:** Medium

**Summary:**

**Problem.** Plugins are loaded via `await import()` of a *fixed* specifier, and Bun caches modules by specifier. Re-importing the same path returns the already-evaluated module, so editing a plugin's `plugin.ts` and reloading returns stale code. No cache-busting mechanism exists anywhere in `src/`. Hot reload cannot be built on the current loader.

**Evidence.**
- `src/plugins/loader.ts:146` — `const mod = await import(/* @vite-ignore */ pluginFile)`, where `pluginFile = join(pluginDir, "plugin.ts")` (computed once at `:132`). The specifier is constant per plugin, so the second import is a cache hit.
- `grep -rn '?v=|cacheBust|cache-bust|Date.now()' src/plugins/` — **zero matches**. No cache-busting exists in the plugin path.
- The only dynamic import in the plugin path is `loader.ts:146`.
- The repo's one config watcher (`src/config/hot-reload.ts:62`) re-imports a *different* module and sidesteps the problem entirely, so it is not a precedent for this.

**UNVERIFIED — verify before designing.** Query-suffix cache busting (`await import(path + "?v=" + Date.now())`) was **never verified in-repo**. The only supporting artefact is a *test comment*: `src/frontend/alpine/shortcuts-listener.test.ts:51` asserts "cache-busting query suffix (it cannot); bun resolves it at runtime", and `:53` does `await import(busted)` inside a test. That is a comment plus one test-only usage — not production evidence, and not a measurement. **If Bun ignores the suffix, hot reload needs a different mechanism entirely** (e.g. a fresh worker, a versioned copy of the plugin directory, or a bundler step). Prove it with a scratch script before committing to a design.

**Fix direction.** Blocked on per-plugin unload (filed separately) — reload needs a way to tear one plugin down first — and on the cache-bust question above. Sequence: (1) verify the suffix mechanism with a two-line scratch script that imports a file, edits it, and re-imports; (2) add per-plugin unload; (3) wire a watcher and a reload path that both work. Do not design step 3 before step 1 returns an answer.

**Verification.** Edit a plugin's `plugin.ts` on disk, trigger reload, and observe the new behaviour — not merely that reload returned without error.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
