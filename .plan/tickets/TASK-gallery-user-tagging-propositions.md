# TASK: User-side gallery tagging + tag propositions

**Epic:** epic-frontend-gallery.md
**Status:** Open
**Priority:** Medium

## Scope

- User tags per gallery item (add/remove/rename), namespaced from system
  tags; tag proposition feed: suggested tags (from metadata/RAG side)
  accepted or dismissed per item, dismissal recorded to tune future
  propositions.
- Tag input with autocomplete from existing vocabulary; ownership check:
  users edit own tags, mods curate global vocabulary.

## Acceptance

- Proposing → accept/dismiss round-trips; dismissed tag not re-proposed
  for same item.
- Tag rename propagates to item detail + filter facets.
