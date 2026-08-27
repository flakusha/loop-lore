# BUG: Inbound federation content not moderated before display

**Status:** not-yet-implemented
**Priority:** high
**Effort:** Medium

## Summary

FEAT-activitypub-federation routes outbound through the NSFW or moderation gate but inbound only supports blocklists or defederation, with no gating before display. Safety gap. Fix: add AC that inbound Create or Announce pass the existing moderation service before persistence or display; define blocklist effect on already-delivered objects. Reuse the existing moderation service.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
