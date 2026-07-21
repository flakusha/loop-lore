# TASK: RPG Token and Map Assets

**Status:** Not Started
**Priority:** Medium
**Epic:** EPIC-2026-28
**Tags:** asset, rpg

## Summary

Implement RPG-specific asset types: tokens for characters/NPCs, battle maps with grid overlay, item cards, spell icons, and condition markers.

## Requirements

### Token Assets

- Square/hex grid support (1x1, 2x2, 3x3 tokens)
- Transparent background preservation
- Token ring color customization
- Status overlay support (conditions, HP, etc.)

### Battle Map Assets

- Grid overlay computation (square/hex)
- Fog of war masking
- Measurement tool integration
- Dynamic lighting zones

### Item Card Assets

- Template-based rendering
- Rarity color coding
- Stat block injection
- Tooltip on hover

### Spell Icon Assets

- Sprite sheet support
- Icon sizing presets (16x16, 32x32, 64x64)
- Animation support (future)

## Implementation

1. Extend `AssetType` enum with `RpgToken`, `RpgMap`, `RpgItemCard`, `RpgSpellIcon`
2. Add `asset_subtype` column to `assets` table
3. Create token overlay service in `src/assets/token-overlay.ts`
4. Create battle map grid service in `src/assets/battlemap.ts`
5. Extend metadata extraction for RPG-specific dimensions
6. Add preview components for each type

## Files

- `src/db/enums.ts` — Extend AssetType
- `src/assets/token-overlay.ts` — Token rendering
- `src/assets/battlemap.ts` — Grid computation
- `src/assets/metadata.ts` — Extended extraction
- `src/frontend/components/asset-token-preview.html`
- `src/frontend/components/asset-map-preview.html`
