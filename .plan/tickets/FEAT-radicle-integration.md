# FEAT-radicle-integration: Radicle P2P collaborative editing

## What

Promote the Radicle collaborative-editing phase from `epic-anonymity-decentralization.md` (Phase 5) into a tracked, implementable ticket. Provide a `RadicleClient` that syncs world/character definitions as content-addressed, server-less Git repositories, enabling offline-first collaborative editing across peers.

## Why

Radicle is the only server-less, content-addressed VCS in the plan and is the natural backbone for offline-first co-authoring of world/character data. It is currently only an "Optional" epic phase with no ticket, so it has no acceptance criteria, owner, or tracking. Ticketizing makes it actionable and links it to the federation/swarm epic.

## Current State

- `epic-anonymity-decentralization.md` Phase 5 defines `RadicleClient` / `RadicleDocument` interfaces and a "Collaborative Editing" section, but no ticket, schema, or implementation exists.
- Research: Radicle is P2P, content-addressed Git with no central server (`rad` CLI + `radicle-node`); node integration is via CLI/HTTP rather than a first-class TypeScript SDK (beta maturity, 1.0 line).

## Acceptance Criteria

- A World or Character definition can be initialized as a Radicle repo and pushed/pulled across peers without a central server.
- `RadicleClient` exposes init/sync/merge against the existing data model.
- Offline edits merge cleanly on the next sync (content-addressed, conflict-resolved at the Git layer).
- Integration is documented as the offline-first path complementary to ActivityPub (`FEAT-activitypub-federation`) and swarm CRDT (`FEAT-swarm-mode-reconciliation`) sync.

## Implementation Notes

- Wrap the `rad` CLI / `radicle-node` HTTP API; do not assume a TS SDK.
- Map world/character schema to repo structure (one repo per world; character cards as tracked files).
- Keep Radicle as the offline-first P2P path; ActivityPub handles cross-instance federation, CRDT handles live multi-writer sync — the three are complementary, not competing.
- Reuse the `EncryptionProvider` seam where repo content is sensitive.

## Dependencies

- `epic-anonymity-decentralization.md` (Phase 5 source)
- `epic-federation-swarm-sync.md` (this epic)
- `epic-communications-integrations.md` (`EncryptionProvider` seam)
