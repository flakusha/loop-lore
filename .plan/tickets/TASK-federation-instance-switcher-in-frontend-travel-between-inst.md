<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Federation instance switcher in frontend (travel between instances)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-instance-federation
**Tags:** federation, frontend, instance-switcher

## Summary

Add a frontend instance switcher so an authenticated user can "travel" to a federated instance and operate on it as a first-class participant — picking from configured peers, opening that instance as the active context, and returning to the home instance without losing local session identity. Mirrors the Lemmy/Mastodon account-switcher pattern. Backend actor-mapping + handle resolution is owned by `epic-instance-federation.md`; this ticket owns the UI + the active-context state.

## Summary

`epic-instance-federation.md` describes the user-facing axis of federation — switching the active instance context, joining a remote instance, `@user@instance` handles — but no ticket scopes the frontend surface. Operators and users currently have no UI way to "visit" a federated instance: the only path is opening a new browser tab and signing in separately. This ticket adds the switcher as a first-class account-menu entry.

## Context

- `epic-instance-federation.md` Scope §"Instance Switching" + §"`@user@instance` Handle Extension" — design intent, no implementation ticket.
- `IDEA-federation-admin-ui-for-follows-blocklists-key-rotation` is admin-only; user-facing switcher is a different surface.
- `epic-frontend-admin.md` covers admin tabs but not user-side federation.
- Per-instance session tokens are issued by the remote auth (`epic-auth-access.md`); this ticket consumes that seam.

## Direction

1. Add a top-bar "instance" control next to the existing account menu (htmx + Alpine.js). On click, open a dropdown listing the user’s known instances:
   - "Home" (the instance the local session was issued on) — always first.
   - Known remote instances from the actor-map table (`src/federation/actor-map.ts` when landed; the spec stage for now).
   - "Add instance…" entry — opens a modal that takes an origin URL, runs WebFinger (or the planned equivalent) to verify the instance is reachable, and persists a federated identity.
2. Switching to a remote instance issues a per-instance session via the existing auth seam (`epic-auth-access.md`) and stores it in `localStorage` keyed by origin; the active origin lives in a single `federation.active_origin` cookie + Alpine store so htmx partials can render the right scope.
3. Worlds/chats/characters listings scope to the active origin; remote-origin content carries a small "via `<remote>`" badge so the user always knows which instance they’re viewing.
4. Returning to Home clears the active-origin state and re-renders against the local session.
5. Alpine store: `federationStore = { activeOrigin, knownOrigins[], switchTo(origin), returnHome() }`. Server route returns a partial that hydrates the store on switch.
6. Keyboard shortcut: `g i` (goto instance) opens the picker — consistent with the existing command palette.

## Acceptance Criteria

- [ ] Top-bar instance control with Home + known instances + Add modal.
- [ ] Switching changes the active context (worlds/chats/characters scoped, "via" badge applied).
- [ ] Per-instance session stored separately; switching does not invalidate the home session.
- [ ] Add-instance flow verifies origin reachability via WebFinger / health endpoint before persisting.
- [ ] Alpine store covers state + transitions; tests cover the store contract.
- [ ] E2E test covers switch → render → return-home cycle.
- [ ] `bun run check` green.

## Dependencies

- `epic-instance-federation.md` (umbrella).
- `epic-auth-access.md` (per-instance session issuance).
- `epic-social-graph.md` (handle-keyed graph edges visible across instances).
- `epic-federation-swarm-sync.md` (transport + actor model).

## Out of Scope

- Backend actor-mapping table (separate ticket — `src/federation/actor-map.ts` design stage).
- Admin defederation UI (`IDEA-federation-admin-ui-for-follows-blocklists-key-rotation`).
- Cross-instance asset / lore sharing (separate `epic-instance-federation.md` §"Cross-Sync" ticket).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
