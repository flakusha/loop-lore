# TASK: Browser-side randomUUIDv7 for time-sortable IDs

**Status:** ✅ Done
**Priority:** medium
**Effort:** small

## Summary

Provide a browser-side UUIDv7 generator so the frontend can mint time-sortable client IDs without falling back to v4. Today the browser path uses WebCrypto (implicit v4) or ad-hoc schemes like `temp-${Date.now()}-${seq}` (chat-send.ts:79), `asp-${Date.now()}` (pages/characters-traits.ts:44), and `preview_${kind}_${Date.now()}` (chat-actions/wizard.ts:75). Replacing those with UUIDv7 gives chronological ordering, B-tree-friendly ids, and a single canonical id shape that aligns with the server-side UUIDv7 work tracked in TASK-adopt-bun-randomuuidv7-for-time-sortable-ids.

Scope (frontend only):
- Add a `browserRandomUUIDv7()` utility (under `src/frontend/browser-uuid.ts`, alongside `browser-crypto.ts`). Works without a Bun runtime (no `Bun.randomUUIDv7` on the browser). Source of randomness: `crypto.getRandomValues`, which is available in insecure contexts (plain-http LAN) — unlike `crypto.randomUUID()`.
- Re-export from `src/frontend/browser.ts` (the existing barrel) so Alpine modules can `import { browserRandomUUIDv7 } from "../browser"`.
- Migrate the ad-hoc frontend id generators enumerated by the scout:
  - `alpine/chat-send.ts:79` → `tmp-${browserRandomUUIDv7()}`. The `tmp-` prefix is preserved because `findLast(... !m.id.startsWith(TEMP_PREFIX))` keys off it; the underlying UUIDv7 provides chronological ordering without the prior per-load `TEMP_SEQ` counter.
  - `pages/characters-traits.ts:44` → raw `browserRandomUUIDv7()` (no `asp-` prefix — nothing else keys off it; the server treats it as opaque).
  - `alpine/chat-actions/wizard.ts:75` → `preview_${kind}_${browserRandomUUIDv7()}` (kind prefix retained for log/debug readability).
- Add unit tests for the new utility colocated at `src/frontend/browser-uuid.test.ts`: canonical UUID regex, version-7 nibble at position 14, variant bits ∈ {8,9,a,b}, timestamp-monotonic across calls, uniqueness across 10 000 samples, deterministic-randomness seam for tests, RangeError on invalid `timestampMs`.
- No DB column changes — these ids stay client-side.

## Acceptance Criteria

- [x] Implementation complete (`src/frontend/browser-uuid.ts`, 11 tests passing)
- [x] Tests passing (`bun test src/frontend/browser-uuid.test.ts`: 11 pass, 0 fail)
- [x] Re-export wired (`src/frontend/browser.ts` exposes `browserRandomUUIDv7` and `isUUIDv7`)
- [x] Ad-hoc frontend id generators migrated (chat-send, characters-traits, wizard)
- [x] `bunx tsc -p tsconfig.frontend.json --noEmit` clean
- [x] `bun test src/frontend/` shows 450 pass, 3 pre-existing failures in `commandButtons.runCommand impersonate dispatch` (unrelated to this change; verified against base commit)
- [ ] Documentation updated (deferred — no consumer-facing docs exist for these client ids; the JSDoc on `browserRandomUUIDv7` is the contract)

## Notes

- The codebase deliberately avoided `crypto.randomUUID()` in `chat-send.ts` because of insecure-context restrictions on plain-http LAN deployments. `crypto.getRandomValues` does NOT have that restriction, so this migration does not regress insecure-context behavior.
- The browser-side helper uses `verbatimModuleSyntax`-friendly exports (no implicit value re-exports); consumers must `import { browserRandomUUIDv7 } from "../browser"`.

Out of scope: server-side Bun.randomUUIDv7 migration (see TASK-adopt-bun-randomuuidv7-for-time-sortable-ids).
