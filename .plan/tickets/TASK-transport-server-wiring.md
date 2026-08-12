# TASK: Transport Server Wiring

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-transport-expansion

## Summary

Wire `src/transport/` into the server. `ws.ts` send() is real, but `http1.ts` (lines 25-28) and `h2.ts` (lines 28-31) send() are silent no-op stubs, and the server does not advertise H2/WS (negotiation advertises HTTP/1.1 only, via `DEFAULT_CAPABILITIES` in `negotiation.ts`). Implement real send() for http1/h2, advertise H2/WS in `DEFAULT_CAPABILITIES`, and hook the transport into the server. H3/WebTransport remain separate existing tasks.

## Acceptance Criteria

- [ ] `http1.ts` and `h2.ts` send() implement real I/O (no silent no-op stubs)
- [ ] H2/WS advertised in `DEFAULT_CAPABILITIES` (`negotiation.ts`)
- [ ] Transport hooked into server startup
- [ ] Backed by tests (existing `src/transport/test/harness.ts` + any new unit tests)

## Linked Epics

- `epic-transport-expansion.md`
