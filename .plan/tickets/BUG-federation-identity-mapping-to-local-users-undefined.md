# BUG: Federation identity mapping to local users undefined

**Status:** not-yet-implemented
**Priority:** high
**Effort:** Medium

## Summary

FEAT-activitypub-federation AC says map fediverse or IM actors to loop-lore auth or session model without trusting foreign auth, but specifies no mechanism, schema, or shadow-account model. Blocks all federation. Fix: add federated_identities (actor_uri to local user_id, shadow or link) schema plus a resolution service; define trust boundary where foreign auth is never trusted and a local session is issued only on verified ownership proof. Reference epic-social-hub.md social graph and Kysely schema.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
