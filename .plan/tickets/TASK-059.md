<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-059: Transport doc — external protocols

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Markdown reference for external protocols (WebSocket, SSE, future WebTransport/QUIC).
**Context:** Integrator-facing; auth, signing, retry semantics.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Effort:** Medium
**Labels**: transport, external-protocols, docs
**Assignee**:
**Epic**: epic-transport-expansion
**Related**:

## Summary

Author `docs/transport/external-protocols.md` (to be created) for integrators and backend engineers documenting how Loop Lore's transport layer speaks to external protocols: WebSocket, federation (ActivityPub), and webhook delivery.

## Context

Audience: integrators building external clients and backend engineers maintaining the protocol adapters. Source anchors: `src/transport/ws.ts`, `src/transport/negotiation.ts`, federation and webhook routes. IN: protocol negotiation, auth at the protocol boundary, message envelopes, failure/retry semantics. OUT: internal transport framing (covered in TASK-057).

## Acceptance Criteria

- Document covers WebSocket upgrade, negotiation, and message envelope shape with examples
- Federation protocol entry points are documented with auth, signing, and replay protection
- Webhook delivery model documents signing, retry, and dead-letter behavior
- Each protocol section links to its source adapter file in `src/transport/`
- Document links to TASK-057 (HTTP/2 deep dive) and TASK-058 (config + observability)

## Related Files

- docs/transport/external-protocols.md (to be created)
- src/transport/ws.ts
- src/transport/negotiation.ts
- src/federation/

## Notes

- Coordinate with federation epic owners on ActivityPub specifics
- Webhook signing scheme must match what TASK-058 observability captures in metrics

Git issue: `50b7c49`
