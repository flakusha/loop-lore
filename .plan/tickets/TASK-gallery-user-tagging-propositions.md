# TASK: User-side gallery tagging + tag propositions

**Epic:** epic-frontend-gallery.md
**Status:** ✅ Resolved (commit c0c24103 — feat(gallery): tag facet + preview tag rename)
**Priority:** Medium

## Scope

- User tags per gallery item (add/remove/rename), namespaced from system
  tags; tag proposition feed: suggested tags (from metadata/RAG side)
  accepted or dismissed per item, dismissal recorded to tune future
  propositions.
- Tag input with autocomplete from existing vocabulary; ownership check:
  users edit own tags, mods curate global vocabulary.

## Resolution

Shipped end-to-end gallery tagging:

- Migration `src/db/migrations/005_asset_tags.ts` adds the append-only
  `asset_tags` / `asset_tag_dismissals` tables (`001_init.ts` is frozen and
  untouched).
- Services `src/assets/service/tags.ts` (normalize, add/remove/rename, list,
  autocomplete vocabulary, GC on asset delete) and
  `src/assets/service/tag-propositions.ts` (metadata-derived propositions,
  dismissal persistence, reserved `source="rag"` hook).
- Routes under `src/routes/asset-tags/` (index + helpers): list/add/remove/
  rename, proposition feed with accept/dismiss, tag-autocomplete endpoint,
  with user-vs-global scope ownership checks.
- Validation schemas in `src/validation/schemas/asset-tags.ts`.
- Frontend `src/frontend/asset-preview-tags.ts` extracted from
  `asset-preview.ts`, wired into the preview modal partial.
- Regenerated DB artifacts: schema files, column-types, insert-helpers,
  db-schemas, and register-plugins wiring.
- Audit follow-ups (commit c0c24103): A2 tag filter facet — gallery/search
  routes accept `tag` (visibleTagNames scope: global + viewer's own user
  tags), cards expose `data-tags`, opt-in `data-show-tag-filter` filter-bar
  select wired through `filterBar` Alpine state, `filter.byTag`/`allTags`
  locales; S1 preview-modal inline rename editor (user-scope chips only) via
  `POST /api/assets/:id/tags/rename`; tag-facets, shared, gallery, search,
  and preview-tag test coverage.

## Acceptance

- Proposing → accept/dismiss round-trips; dismissed tag not re-proposed
  for same item.
- Tag rename propagates to item detail + filter facets.
