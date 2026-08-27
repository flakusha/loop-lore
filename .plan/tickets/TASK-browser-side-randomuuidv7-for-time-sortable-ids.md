# TASK: Browser-side randomUUIDv7 for time-sortable IDs

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** small

## Summary

Provide a browser-side UUIDv7 generator so the frontend can mint time-sortable client IDs without falling back to v4. Today the browser path uses WebCrypto (implicit v4) or ad-hoc schemes like `temp-${Date.now()}-${seq}` (chat-send.ts:79) and `asp-${Date.now()}` (pages/characters-traits.ts:44). Replacing those with UUIDv7 gives chronological ordering, B-tree-friendly ids, and a single canonical id shape that aligns with the server-side UUIDv7 work tracked in TASK-adopt-bun-randomuuidv7-for-time-sortable-ids.\n\nScope (frontend only):\n- Add a `browserRandomUUIDv7()` utility (likely under src/frontend/, alongside browser-crypto.ts). Must work without a Bun runtime (no `Bun.randomUUIDv7` on the browser). Source of randomness: `crypto.getRandomValues`.\n- Export from src/frontend/index.ts so Alpine modules can pull it in.\n- Migrate the ad-hoc frontend id generators enumerated by the scout (`temp-${Date.now()}`, `asp-${Date.now()}`, any `crypto.randomUUID()` browser call sites).\n- Add unit tests for the new utility (uuid v7 format regex; monotonic-ish ordering for calls in the same ms; uniqueness across 10k samples).\n- Document any DB column that newly receives v7 ids (none expected — ids stay client-side).\n\nAcceptance:\n- New helper module + tests pass `bun run check` and `bun test src/frontend/`.\n- All ad-hoc frontend id generators in scope replaced; no `Date.now()`-based ids remain in `src/frontend/**`.\n- Output format matches RFC 9562 v7: 48-bit unix-ms timestamp + 4-bit version (7) + 12 bits of rand-a + 2-bit variant + 62 bits of rand-b.\n\nOut of scope: server-side Bun.randomUUIDv7 migration (see TASK-adopt-bun-randomuuidv7-for-time-sortable-ids).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
