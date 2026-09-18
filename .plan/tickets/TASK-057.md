<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-057: Transport doc — HTTP/2 deep dive

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Markdown deep-dive into HTTP/2 framing, multiplexing, ALPN, upgrade.
**Context:** Cited against src/transport/h2.ts and upgrade.ts.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Effort**: Medium
**Labels**: transport, http2, docs
**Assignee**:
**Epic**: epic-transport-expansion
**Related**:

## Summary

Author `docs/transport/http2-deep-dive.md` (to be created) for backend and SRE engineers covering HTTP/2 framing, stream multiplexing, server push deprecation, and how the codebase upgrades from HTTP/1 in `src/transport/h2.ts` and `src/transport/upgrade.ts`.

## Context

Audience: backend engineers integrating with the transport layer and SRE tuning connections. Source code anchors: `src/transport/h2.ts`, `src/transport/upgrade.ts`, `src/transport/negotiation.ts`. IN: HTTP/2 connection lifecycle, ALPN negotiation, stream priorities, error handling, connection coalescing. OUT: QUIC/HTTP/3 (covered separately), front-end client behavior.

## Acceptance Criteria

- Document covers HTTP/2 framing, multiplexing, ALPN negotiation, and connection upgrade from HTTP/1
- Each code path cited references an existing file in `src/transport/`
- Failure modes (GOAWAY, RST_STREAM, flow control violations) are documented with the handler in code
- Document renders correctly in the docs site and links to the HTTP/1 and config docs
- Reviewer from epic-transport-expansion confirms technical accuracy

## Related Files

- docs/transport/http2-deep-dive.md (to be created)
- src/transport/h2.ts
- src/transport/upgrade.ts
- src/transport/negotiation.ts

## Notes

- Sibling of TASK-058 (config + observability) and TASK-059 (external protocols); cross-link
- Coordinate with SRE on which flow-control and MAX_CONCURRENT_STREAMS values are operationally safe

Git issue: `3048980`
