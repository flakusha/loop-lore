# FEAT: Seed Default Characters with Avatar Support

**Status:** Open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-character-spec
**Labels:** seeding, character, avatar, asset, gallery
**Related:** `TASK-character-avatar-gallery-binding.md`, `FEAT-seed-default-characters-identity.md`, `src/characters/seed.ts`, `src/config/sections/characters.ts`, `src/characters/services/avatar-service.ts`, `src/assets/service.ts`, `.plan/epics/epic-character-core-system.md`

## Summary

Wire the **character seeder to create and link avatars** for seeded default characters, using the already-implemented asset + avatar pipeline. Today `seedCharacterTemplates` (`src/characters/seed.ts:70-94`) inserts into `actors` only and creates **no avatar at all** — seeded characters are avatar-less. This is an **orthogonal concern** to the race/origin `Lore` identity work (self-contained avatar provisioning), per the task split.

The avatar **tooling is fully wired already**; the seeder just doesn't call it. The deliverable is the seeder integration + the avatar source contract for templates.

## Background

Grounded in `src/`:

- **Avatar pipeline is implemented.** `AvatarService.createAvatar` (`src/characters/services/avatar-service.ts:117`) does BOTH the `character_avatars` insert **and** the gallery-visible asset link: it calls `linkAsset({ entityType: AssetLinkEntity.Actor, entityId: actorId, label })` internally (lines 146-154). So a single `createAvatar` call yields the avatar + the `asset_links` entry the gallery needs — no separate `linkAsset` call required.
- **Asset creation is implemented.** `createAsset` (`src/assets/service.ts:222`) takes a `CreateAssetInput` (`ownerId`, `filename`, `mimeType`, `assetType`, `sizeBytes`, `buffer`, …) and dedupes by `content_hash` + `ownerId` (line 232). It returns the asset id.
- **Seeder is NOT wired.** `seedCharacterTemplates` (`seed.ts`) creates only the `actors` row. It has a `database: Kysely<DB>` handle (enough to call the services), but calls neither `createAsset` nor `createAvatar`.
- **No bundled default-avatar asset exists** in `src/` or `configs/` — the only "placeholder" is the anonymous `👤` glyph (`src/crypto/anonymous.ts` `getAnonymousAvatar`), not a real image asset. So a seed avatar needs a defined **source contract**.

So: even if a character template specified an avatar today, the seeder would silently ignore it. This ticket closes that gap.

## Scope

### 1. Avatar source contract on `CharacterTemplate` (code, in `src/config/sections/characters.ts`)

Add an optional avatar reference to `CharacterTemplate`, resolved at seed time:

```typescript
export interface CharacterTemplate {
  // ...existing...
  /** Optional avatar for the seeded character. Resolved at seed time. */
  avatar?: TemplateAvatarSource;
}

type TemplateAvatarSource =
  /** Path to a bundled image shipped with the app (e.g. assets/avatars/elara.png) */
  | { type: "file"; path: string }
  /** A packaged placeholder/generated source (chosen by the implementer) */
  | { type: "default" };
```

Keep it optional — templates without `avatar` seed avatar-less (current behavior preserved). Decide the concrete bundled-asset location during implementation (no existing convention; a new `assets/avatars/` or `configs/avatars/` dir is acceptable) and document it.

### 2. Wire avatar creation into the seeder (primary deliverable)

In `seedCharacterTemplates`, **only after** a template's `actors` insert succeeds (actor id known), if `template.avatar` is set:

1. Load/resolve the avatar bytes + mime type from the source contract.
2. `createAsset({ database, input: { ownerId, filename, mimeType, assetType: "image", sizeBytes, buffer } })` → `assetId`. (Dedup by content+owner is automatic; reuse any existing asset with the same bytes.)
3. `new AvatarService(database).createAvatar({ actorId: id, assetId, label: "default", isPrimary: true })` → writes `character_avatars` + `asset_links(entity_type=actor)`.

Place inside the same per-template try/catch as the `actors` insert. A failed avatar creation must be **logged + recorded in `result.errors`** and must not crash the batch — but it should not be silently swallowed either, so the operator sees the character seeded without its avatar. Optionally roll back the actor on avatar failure (prefer: leave actor, report error — a broken avatar is non-fatal, a missing character is worse).

**Idempotency is already safe:** re-seeding skips actors that exist by `display_name` + `owner_id` (`seed.ts:44-58`) before any avatar work, so avatars are never duplicated.

### 3. Add avatars to built-in defaults

Populate `CHARACTERS_DEFAULTS.templates` with `avatar` refs for the built-in characters that have a sensible representative image. If no suitable bundled art exists at implementation time, ship a small set of simple default avatar images (or generate SVG placeholders) so the wiring is actually exercised. `tpl-assistant` may omit `avatar` to keep the "no avatar = current behavior" path proven.

### 4. Update `feature-character-template-seeding.md`

Document the `avatar` field, the resolved source location, and that a seeded avatar is automatically visible in the gallery filtered by `entity_type=actor`.

## Acceptance Criteria

- [ ] `CharacterTemplate.avatar` supports a file/default source contract
- [ ] Seeding a template with `avatar` creates an `assets` row, a `character_avatars` row (`is_primary: 1`, label `default`), and an `asset_links` row (`entity_type=actor`) — via `createAvatar`'s internal linking
- [ ] Templates without `avatar` seed avatar-less (existing behavior preserved)
- [ ] Avatar creation failure is logged and recorded in `result.errors` without crashing the batch or leaving a half-created state
- [ ] Idempotent: re-seeding does not duplicate the actor, asset, avatar, or link
- [ ] Built-in defaults reference avatars (except any chosen to prove the no-avatar path)
- [ ] Seeded avatar appears in the gallery filtered by `entity_type=actor&entity_id=<id>` (reusing the `TASK-character-avatar-gallery-binding` filter work)
- [ ] Unit tests: avatar source resolution, asset+avatar+link creation on seed, omitted-avatar no-op, failure handling, idempotent reseed
- [ ] `bun run check` + `bun test src/` pass

## Files

- `src/config/sections/characters.ts` — `CharacterTemplate.avatar`, `CHARACTERS_DEFAULTS` avatar refs
- `src/characters/seed.ts` — resolve + `createAsset` + `createAvatar` after actor insert (primary change)
- `src/characters/services/avatar-service.ts` — reuse `createAvatar` (read-only)
- `src/assets/service.ts` — reuse `createAsset` (read-only)
- bundled avatar assets (new location, e.g. `assets/avatars/`) — default images
- `src/characters/seed.test.ts` — avatar seeding tests
- `.plan/epics/epic-character-core-system.md` — document avatar seeding

## Notes

- **This ticket does the avatar wiring; it is not a template-data-only change.** The seeder integration is the deliverable; the built-in refs exercise it.
- **Explicitly independent** of the race/origin `Lore` epic set (`FEAT-race-origin-lore-identity-*`, `FEAT-character-spec-inclusion-*`, `FEAT-origin-capture-generation-seeding`) — it touches neither identity traits nor lore config. It can be scheduled/merged alone.
- Avatar ownership: seeded avatars are owned by the same `ownerId` that owns the seeded actor (the seeder's `ownerId` param, often the system user) so gallery visibility inheritance works.
