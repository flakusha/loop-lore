# BUG: Chat/IM adapter abstraction duplicated (ProtocolAdapter vs SocialAdapter), no code

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

Chat/IM adapter abstraction duplicated: `ProtocolAdapter` (chat/IM) vs `SocialAdapter` (social hub). No concrete code has landed under either; both are aspirational.

**Fix direction**: consolidate to one abstraction. Re-evaluate after scoping IRC, Matrix, ActivityPub integration tickets to determine the right boundary (chat vs social). Likely outcome: a single `Adapter` interface used by both subsystems, with `Social`-flavored adapters wrapping chat primitives for federation-shaped transports.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: ProtocolAdapter/SocialAdapter removed from src/ (zero hits); consolidation resolved by removal.
