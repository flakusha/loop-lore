# BUG: Character federation lacks owner consent or NSFW gate

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

FEAT-activitypub-federation models a Character as Person or Service with no opt-in or NSFW classification gate before publishing it as a fediverse actor. Safety and legal gap. Fix: add a federation_consent flag to the character schema and gate actor publication on it plus the existing NSFW classification.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
