# BUG: Turn state blind read-modify-write — lost updates on concurrent turns

**Status:** ✅ Resolved (2026-09-06)
**Priority:** high
**Effort:** Medium

## Summary

src/turning/turn-manager/state.ts:11 — persistState does blind read-modify-write of story_state JSON column, no transaction/optimistic version; two TurnManager instances for same chat → lost updates on currentTurn/turnOrder/pendingRegeneration. Related minor lifecycle.ts:9: requestRegeneration overwrites pendingRegeneration without checking one pending. Fix: optimistic version column or tx with compare-and-swap.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed in branch `bugfix-round-6` (commit `7c293b3`, dev merge pending).

`src/turning/turn-manager/state.ts`: `persistState` now does optimistic compare-and-swap with retry:

- Signature: `persistState(host, mutate: (state) => void | Promise<void> = () => {})`. The mutation closure is **re-appliable** — on a CAS conflict it re-runs against the freshest committed state, so the caller's change is never lost to a stale snapshot.
- Loop (max `PERSIST_RETRIES = 3`): re-read `chats.story_state` → rebase `host.state` onto the committed copy (keeping the host's `strategy`/`maxTurns`, refreshing `turnOrder` when empty) → `await mutate(state)` → serialize → cas UPDATE `WHERE id = chatId AND story_state = <value just read>` (`IS NULL` for the null case). Zero affected rows = concurrent write → retry. Exhaustion throws instead of silently dropping the mutation.
- No schema change needed: `chats` has no `format_version` column, so the CAS compares the `story_state` string itself (append-only migration policy avoided).

Callers thread their exact mutation into the closure (no blind mutation outside persist):
- `lifecycle.ts`: `requestRegeneration` (sets `pendingRegeneration`), `clearRegeneration`, `pause`, `resume`, `resetTurnCounter`.
- `selection.ts`: `recordTurn` (persists `lastTurnCompletedAt`); `selectNextActor` now performs **both** the `currentTurn` increment and the actor selection *inside* the closure — the increment is relative to the fresh state (`state.currentTurn + 1`) instead of a stale precomputed value, so concurrent selectors each advance the shared counter (no lost turn). Behavior change: selection now persists immediately (previously only mutated memory until `recordTurn`).

Tests: `src/turning/turn-manager.test.ts` adds "concurrent selectNextActor does not lose updates (BUG-turn-state blind RMW)" — two instances call `selectNextActor` on the same chat concurrently; a fresh third instance observes `currentTurn === 2` (both increments survived), and neither in-memory instance exceeds 2. Full suite: 19 pass / 0 fail.
