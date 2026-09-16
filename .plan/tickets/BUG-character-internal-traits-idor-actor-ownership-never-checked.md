# BUG: Character internal traits IDOR — actor ownership never checked

**Status:** ✅ Done — duplicate of BUG-character-internal-traits-idor-cross-user-read-write-delete (fixed on dev by 06ca7e9d + f2f0eb26)
**Priority:** high
**Effort:** Medium

## Summary

src/routes/character-internal-traits/index.ts:101 — DELETE/PUT use only requireUserId; actorId from query never ownership-checked (requireActorAccess not called). Any user can overwrite/delete any actor's traits. Fix: call requireActorAccess. DUPLICATE: canonical ticket BUG-character-internal-traits-idor-cross-user-read-write-delete covers GET/PUT/DELETE/prompt and is ✅ done on dev (06ca7e9d PUT/DELETE + f2f0eb26 GET/prompt). Verified 2026-09-16: current code calls requireActorAccess on all four handlers (index.ts:84,111,138,163). No code change in this ticket.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Duplicate. Fixed on dev by `06ca7e9d` + `f2f0eb26` (see canonical ticket Resolution). All four handlers authorize actorId via requireActorAccess. No code change required.
