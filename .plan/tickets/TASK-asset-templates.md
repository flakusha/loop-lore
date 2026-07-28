# TASK: Asset Templates and Presets

**Status:** Not Started
**Priority:** Low
**Epic:** epic-items
**Tags:** asset, template

## Summary

Create asset templates and presets for common use cases, enabling one-click generation of standard assets.

## Requirements

### Template Types

- Character token templates (square/hex, ring colors)
- Map templates (grid sizes, fog presets)
- Item card templates (rarity styles, stat layouts)
- Document templates (business report formats)
- Presentation templates (slide layouts)

### Template Features

- User-created templates
- World-scoped templates
- Community template sharing
- Preset dimensions (1024x1024, 1920x1080, etc.)
- Style presets (dark, light, fantasy, sci-fi)

### API Endpoints

- `GET /api/templates` — List templates
- `POST /api/templates` — Create template
- `GET /api/templates/:id` — Get template
- `PUT /api/templates/:id` — Update template
- `DELETE /api/templates/:id` — Delete template
- `POST /api/assets/from-template` — Generate from template

## Implementation

1. Create `asset_templates` table
2. Add template CRUD to service
3. Create template UI component
4. Add template selector to upload flow
5. Implement preset rendering

## Files

- `src/db/migrations/020_asset_templates.sql` — Migration
- `src/assets/templates.ts` — Template service
- `src/assets/controller.ts` — Template endpoints
- `src/frontend/components/asset-template-selector.html`
