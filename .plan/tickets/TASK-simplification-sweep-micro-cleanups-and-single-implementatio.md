<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Simplification sweep: micro-cleanups and single-implementation wrappers (low priority)

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

One low-priority pass over every shrink/yagni/stdlib/native finding in the simplification audit: duplicated formatters, switch-ladder-to-Record, single-implementation base classes, hand-rolled modals and hand-rolled base64 codecs. Research: the over-engineering audit's per-area findings (scratch, not on disk) (frontend, platform, rpg, routes, characters-assets).

**Context:**

One deliberately low-priority pass over every `shrink:` / `yagni:` / `stdlib:` / `native:`
(non-deletion) finding from the over-engineering audit. Nothing here is dead code — each item is a
behaviour-preserving reduction in surface area. Sources: the over-engineering audit's per-area findings (scratch, not on disk).
Pick the items that are safe in one sitting; every group below is independent.

**A. Duplicated formatters / markup (frontend.md)**

- Four copies of the byte-size formatter — `src/frontend/pages/shared.ts:37-42`,
  `src/frontend/asset-preview.ts:39-43`, `src/frontend/components/asset-preview-modal.ts:46-52`,
  `src/frontend/alpine/model-manager.ts:226-231`. `grep -rn "function formatSize|formatSize(bytes" src/frontend`
  → 4 hits with slightly different bodies (one caps at MB, three at GB; one returns `""` for 0).
  **Caveat: `Intl.NumberFormat` with `notation:"compact"` does NOT round-trip these strings** (it
  yields `1.2M`, not `1.2 MB`) — dedupe the existing helper, do not swap the API. Reconcile the unit
  caps deliberately and say which won.
- Duration formatter written twice — `src/frontend/alpine/admin-harness-format.ts:33-36` and
  `src/frontend/alpine/chat-stats.ts:9-13` (`grep -rn "ms / 60_000" src/frontend` → 2 hits).
- `src/components/harness/admin-harness-panel.html:96-100,141-146,180-184` hand-rolls the empty
  state four times although `src/components/empty-state.html` exists for exactly this (the file's own
  comment at line 10 says the partial exists because hand-rolling it "was a jscpd clone"). Use
  `{{> empty-state.html}}` + data attributes, as the same file already does for
  `{{> loading-state.html}}` at lines 14 and 215.

**B. Switch ladders and duplicated logic (rpg.md)**

- `src/battle/item-mapping.ts:37-102` — `categoryToType` / `categoryToSlot` are switch ladders over a
  fully-enumerated input union with constant bodies; a `Record<ItemCategory, ItemType>` (and a
  `Partial<Record<ItemCategory, EquipmentSlot>>`) is equivalent and stays exhaustiveness-checked by
  the compiler.
- `src/battle/resolution-integration/checks.ts:35-47,81-93,158-167` — the same 4-branch narration
  ladder (`criticalSuccess → criticalFailure → success → fail`) is written three times, and the
  `margin = roll.total - dc.value` / `success = crit || (!critFail && margin >= 0)` pair is duplicated
  verbatim at 35-36 and 81-82. One `narrate(roll, success, labels)` helper.
- `src/rpg/intimacy/service/persist.ts:25-41` and `src/rpg/seduction/service/attempt.ts:29-45` —
  `getActorStatBlock` is duplicated verbatim (exported in one, private in the other). Promote one
  into `src/rpg/shared/` (where `rpg-service-utils.ts` already lives) and import it in both
  (`grep -rn "getActorStatBlock" src/` → the two definitions plus call sites at
  `intimacy/service/actions.ts:121` and `seduction/service/attempt.ts:162`).
- `src/rpg/loot/generation.ts:33-38,88-119` — the `eligible` accumulation loop is
  `entries.filter((e) => e.minLevel <= level)`, and the trailing fallback branch re-constructs the
  same drop literal built earlier; hoist a `toDrop(entry)` helper. `Array.prototype.at` is already the
  house idiom, so use `entries.at(-1)`.
- `src/rpg/replayability/service/{endings,ngp,playthrough}.ts:12-14`,
  `src/rpg/questions/service.ts:36-38`, `effects.ts:24-26`,
  `src/rpg/npc-navigation/service/movement.ts:18-20`, `src/rpg/skills/service/helpers.ts:16-18`,
  `src/rpg/achievements/service/helpers.ts:18-20` — eight identical one-line `getLog()` wrappers around
  `getRpgLog`; call `getRpgLog("…")` directly.
- `src/plugins/tool-executor.ts:39-50` — `executePluginTool` hand-rolls a two-arm `new Promise`
  race to reach `clearTimeout`; use `Promise.race([handler, timeout])` plus `finally { clearTimeout }`.
  **Do not** reach for `AbortSignal.timeout` — nothing cancels the handler today.

**C. Single-implementation abstractions (platform.md, routes.md)**

- `src/logger/queue-base.ts:1-180` — a 180-line `abstract class AsyncLogQueueBase` with exactly two
  subclasses (`src/logger/queue.ts:22` for Node, `src/frontend/alpine/queue.ts:14` for the browser).
  The shared logic is buffer/timer plumbing that differs only in the timer `unref` and the stderr
  fallback; the base already branches on `"unref" in this.timer` internally. Collapse into one
  class parameterised on that capability check (`grep -rn "AsyncLogQueueBase" src` → 2 `extends`
  sites plus two test-local subclasses — update the tests too).
- `src/crypto/pipeline-types.ts:1-30` — a types-only module holding three interfaces that the
  sibling `pipeline.ts` can declare inline; it exists purely to break a circular import between
  `pipeline.ts` and `index.ts`, and both types are re-exported from `index.ts` anyway. Move the
  interfaces above the import (`grep -rn "pipeline-types" src tests scripts` → only `pipeline.ts`
  and `index.ts`).
- `src/routes/http-utils/auth-narrowing.ts:70-87` — `withUserAuth` is a single-implementation
  wrapper with zero production callers; `withOwnerAuth` already generalizes it (9 production sites in
  `src/routes/actor-items/service.ts` + `crafting/station-defs.ts`).
- `src/routes/v1/openapi.ts:44-101` — `buildVersionedOpenApiSpec` has exactly one caller, 30 lines
  below it in the same file (`openapi.ts:103`); its export exists only so `openapi.test.ts` can reach
  it. Make it module-private.
- `src/routes/metrics.ts:36,111` — `renderMetrics()` is split from its only caller behind an export;
  inline it back (no caller anywhere passes an argument).

**D. Route-handler duplication (routes.md)**

- The same 11-line "load actor row → 404 → `can(role,"admin.character")` → 404 unless public/owned"
  preamble is copy-pasted at `src/routes/characters/card.ts:26-46`, `export.ts:40-60`, `read.ts:25-45`,
  while `src/routes/actor-auth.ts:36-52` (`requireActorAccess`) already implements the ownership
  half. Reuse it instead of pasting the block a fourth time. This is `yagni:`-class duplication
  (jscpd-confirmed), not dead code.

**E. stdlib / native replacements (behaviour-sensitive — read the caveat)**

- `src/assets/base64url.ts:11-15` — `base64urlEncode` re-implements `Buffer#toString("base64url")`,
  which the runtime ships and which this repo already uses at `src/chat/service/branch-list.ts:52`
  and `src/memory/audit.ts:134`. Collapse it.
  **CAVEAT — `base64urlDecode` MUST STAY as is.** Node/Bun's `Buffer.from(s, "base64url")` silently
  skips out-of-alphabet characters, which this repo documents at `src/memory/audit.ts:96-100` and
  `src/chat/service/branch-list.ts:59`. The decode side feeds HMAC signature comparison at
  `src/assets/signed-url.ts:184-186`, so that strictness is load-bearing validation, not incidental.
  Only the ENCODE half is a stdlib candidate. (`src/auth/jwt.ts:82-96` has a near-verbatim private
  copy of both halves — leave it; it collapses for free once the encode side is stdlib.)
- `src/utils/base64.ts:1-31` — hand-rolled `btoa`/`atob` string-joining vs the ES-standard
  `Uint8Array.prototype.toBase64()` / `Uint8Array.fromBase64()`. **Caveat: confirm the browser-bundle
  target set by `scripts/build-frontend.mjs` supports the methods before cutting.** The file's own
  header says it avoids `Buffer` "so this works the same in browser + Node + Bun", which the native
  methods also satisfy — but if the browser target does not ship them, the file correctly stays.
- `src/frontend/alpine/focus.ts:140-148` — `isInViewport()` hand-rolls viewport intersection.
  `IntersectionObserver` is asynchronous and would change `focusIntoView()`'s synchronous contract
  (line 162 calls it immediately before `element.focus()`). **Owner decision, not a mechanical cut:**
  `element.checkVisibility()` is only the right swap if the intent is display/visibility rather than
  viewport position.
- The app hand-rolls its modal system (`div.modal-overlay` + Alpine `x-show` + `@click.self` +
  `@keydown.escape.window`) at 13 sites: `src/components/chat/archive-confirm.html:8`,
  `branch-list-panel.html:93,130`, `branch-merge-modal.html:221`, `chat-settings-modal.html:10,823`,
  `media-preview-modal.html:9`, `message-list.html:789,868`, `rename-chat-modal.html:9`,
  `src/components/modals/settings.html:8`, `src/components/asset-preview-modal.html:28-32`,
  `src/views/personas.html:95`, `src/components/key-management.html`. The platform ships `<dialog>`
  (`showModal()`/`close()`/`returnValue`), which gives the backdrop, top-layer stacking, Escape-to-close
  and focus trapping as one element. **CAVEAT: this is an a11y-sensitive migration, not a deletion —
  converting changes focus order.** `grep -rn "showModal()|<dialog" src/` → zero hits today. Land it
  as its own PR with a keyboard/focus pass, or file it separately; do not bundle it with a deletion.

**F. Mappings instead of hand-inverted switches (characters-assets.md)**

- `src/characters/errors.ts:198-243` — `getHttpStatusFromErrorCode` is an 8-arm switch hand-inverting
  `STATUS_TO_CODE` at `src/routes/http-utils/errors.ts:17-28`. Same 9 codes, same numbers, opposite
  direction: use an inverted `Record<ErrorCode, number>` or move the inverse onto `STATUS_TO_CODE`.

**Caveats / constraints:**

- Every item must be behaviour-preserving and covered by the existing tests. If an item needs a new
  test to prove equivalence, that is fine — but no item may ship with "verified by inspection".
- Group E is deliberately separable: the `<dialog>` migration and the `focus.ts` change are owner
  decisions and may be dropped from this ticket without blocking A-D/F.
- Do not touch the areas the audits explicitly called lean: `src/frontend/` module structure,
  `src/services/alpha-status.ts`, `src/rpg/crafting/station-types.ts`, the four one-line `clamp`
  call sites (`body-systems/service/profile.ts:74-76`, `schemas/reputation.ts:99-101`,
  `stats/proficiency.ts:14`, `xp/calculation.ts:14`), and the battle integration schema tables.
- Do not fold any *deletion* from this ticket — those live in the subsystem-specific tickets.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
