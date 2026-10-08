<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Enforce plugin origin at request time

**Status:** Not Started
**Priority:** high
**Epic:** epic-plugin-system
**Effort:** Medium

**Summary:**

**Problem.** Tiering is load-time only. The origin→capability allowlist is the sole tier enforcement and `origin` is never consulted when a request is dispatched, so a `community`-origin plugin's routes/tools/roles behave identically to a `core`-origin plugin's at request time. The tiers are decorative. This is the tier/provenance work item.

**Evidence.**
- `src/plugins/registry-policy.ts:7-11` — `PLUGIN_ORIGIN_CAPABILITIES`: `core` and `local` may register `migrations`; `community` may not. This is the only place origin is enforced.
- `grep -rn 'origin' src/plugins/route-access.ts` returns **zero matches** — the request-time gate never reads the plugin's origin.
- `src/plugins/loader.ts:234-251` `dispatchPluginRoute` → `:241` `checkRouteAccess({ route, request, caller, t })`, which reads the *route's own* `requiresAuth`/`permissions`, not its owner's origin.
- `src/plugins/types.ts:19` — `PluginOrigin` is three values; `src/plugins/loader.ts:33` `PLUGIN_DIRS` derives origin from the directory a plugin was found in, so origin is path-derived and never user-asserted.

**Impact.** The tier distinction a reader of `registry-policy.ts` would assume exists does not exist at runtime. `community` plugins can serve routes and register tools with the same weight as `core`, and the allowlist only constrains *which extension points a plugin may declare at load time* — it says nothing about what those routes may then do.

**Fix direction.** Carry origin through to the request path: resolve the owning plugin for each dispatched route/tool and consult `PLUGIN_ORIGIN_CAPABILITIES` alongside the existing per-route checks, so an origin that is not permitted for that surface is denied at request time rather than only at registration. Fold in the adjacent dead field while here: `sandboxed` is declared on `ToolDefinition` at `src/plugins/types.ts:112` and has **no reader anywhere** in `src/` — either wire it into the same tier decision or delete it, since the plugin spec (`docs/spec/plugin-system.md`) already repeats an unimplemented signature-verification claim and a second dead field compounds that.

**Verification.** A `community`-origin plugin that manages to register a restricted surface is denied at dispatch time even though `checkRouteAccess` itself returns null; and `grep -rn 'sandboxed' src/` returns no declaration-only hit.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
