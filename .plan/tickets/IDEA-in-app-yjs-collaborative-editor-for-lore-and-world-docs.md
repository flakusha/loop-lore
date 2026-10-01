<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: In-app Yjs collaborative editor for lore and world docs

**Summary:** Real-time multiplayer authoring of lore or world documents in-app, extending FEAT-swarm-mode-reconciliation beyond Radicle git-based definitions.
**Context:** Extends `FEAT-swarm-mode-reconciliation.md` (verified on disk). Priority: low. Effort: Medium. Scoped as a future FEAT.
**Acceptance Criteria:** Product decision recorded: adopt, defer, or reject, with rationale.


**Status:** Deferred — blocked on FEAT-swarm-mode-reconciliation landing

## Resolution (2026-10-01)

**Decision: Defer.**

### Rationale

`FEAT-swarm-mode-reconciliation` is verified on disk (`.plan/tickets/FEAT-swarm-mode-reconciliation.md`). The ticket's premise — extending it for real-time in-app Yjs collaboration on lore/world documents — is a coherent direction. However:

1. **Prerequisite not started.** `FEAT-swarm-mode-reconciliation` has Status: Not Started. Building a Yjs layer on top of a CRDT reconciler that doesn't yet exist puts this ticket at two levels of indirection from implementation.
2. **Radicle already covers async collaborative authoring.** `FEAT-radicle-integration.md` is also verified on disk and covers offline-first collaborative world/lore editing via git semantics. Yjs real-time sync is a different surface — live cursor presence and concurrent edits — that is additive to, not a replacement for, the git-based path.
3. **Yjs scope ambiguity.** The ticket says "beyond Radicle git-based definitions" — it's unclear whether this means Yjs replaces the git-based authoring workflow for lore docs, or coexists with it. The UX of mixing git-based async review + Yjs live sync for the same document is complex.
4. **Relation to `FEAT-swarm-mode-reconciliation` scope.** If the CRDT reconciler uses cr-sqlite (as preferred in `FEAT-swarm-mode-reconciliation`), Yjs is the fallback for "rich shared types only" — which may cover rich-text lore docs. That decision hasn't been made yet.

### Recommendation

Revisit when `FEAT-swarm-mode-reconciliation` has shipped cr-sqlite or Yjs CRDT state, AND the Radicle collaborative authoring path (`FEAT-radicle-integration.md`) is in progress or shipped. At that point, evaluate whether Yjs real-time sync adds enough over the git-based path to justify the complexity. If yes, file a new scoped ticket.
**Priority:** low
**Effort:** Medium

## Summary

Extension: build on FEAT-swarm-mode-reconciliation to offer real-time multiplayer authoring of lore or world documents in-app, beyond Radicle git-based definitions. Scoped as a future FEAT.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
