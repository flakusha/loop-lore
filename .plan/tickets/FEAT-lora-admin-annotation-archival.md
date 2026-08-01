# FEAT: LoRA Admin Annotation & Archival
**Status:** Open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-lora-discovery-application
**Labels:** frontend, lora, admin
**Issue:** `7492d4b`
**Related:** `epic-lora-discovery-application.md`, `src/generation/lora/*`

## Summary

Frontend: discovered LoRAs annotated in admin interface with purpose + recommended intensity (strength) application values. Plus gray-out (archived) + removal logic for LoRAs deleted/moved server-side.

## Background

LoRA discovery (`GET /api/lora/list`, `POST /api/lora/discover`) returns raw `LoRAModel[]` — filename, path, backend. No way for an admin to record *what a LoRA is for* (character, style, concept) or the *recommended strength* at which it should be applied. Also, a LoRA may exist in DB but later be deleted/moved on the server/application side — the UI must handle stale entries gracefully (gray-out / archive) with explicit removal.

## Scope

### 1. Annotation (purpose + recommended strength)

- Admin interface (matches existing `admin-models.ts` / `admin.ts` Alpine pattern) lists discovered LoRAs.
- Per-LoRA editable fields:
  - **Purpose**: free-text or enum (e.g. `character` | `style` | `concept` | `other`) — describes what the LoRA is for.
  - **Recommended strength**: number 0.0-1.0 (clamped), the default intensity to apply when this LoRA is used. Maps to existing `LoRAModel.recommendedStrength`.
  - Optional: trigger words (surface existing `triggerWords` field).
- Annotations persisted server-side (Kysely table or extension of existing LoRA storage) — NOT just client state, so they survive rediscovery and are available to the application pipeline (Phase 2 wiring).

### 2. Archival / gray-out (stale LoRA handling)

- A LoRA saved in DB may be deleted or moved server/application-side after discovery.
- When current discovery no longer returns a LoRA that exists in DB, mark it **archived** (grayed out) rather than hard-removing:
  - UI renders archived LoRAs grayed/dimmed with a badge (e.g. "missing" / "archived").
  - Archived LoRAs excluded from active application by default.
- **Removal logic**: explicit admin action to permanently delete an archived (or any) LoRA record from DB — confirmation required (destructive).
- Re-discovery of a previously-archived LoRA (file returns / moved back) un-archives it automatically.

## Acceptance Criteria

- [ ] Admin UI lists discovered LoRAs (reuse existing admin Alpine component pattern)
- [ ] Per-LoRA purpose + recommended strength editable and persisted server-side
- [ ] Recommended strength validated/clamped to 0.0-1.0
- [ ] LoRAs missing from current discovery grayed out / marked archived (not hard-deleted)
- [ ] Archived LoRAs excluded from active application by default
- [ ] Explicit removal action with confirmation deletes LoRA record from DB
- [ ] Re-discovery un-archives a returned LoRA automatically
- [ ] Backend route(s) for annotation read/write + archive/remove (consistent with `src/generation/lora/routes.ts` style)
- [ ] Unit tests for annotation persistence, archival, un-archive, removal
- [ ] `bun run check` + `bun test src/` pass

## Notes

- Builds on `LoRAModel` (`triggerWords`, `recommendedStrength` already in interface, discovery does not yet extract them — annotation fills this gap).
- Persistence layer: follow Kysely conventions (`src/db/`), add migration for LoRA annotation table.
- Reference existing admin Alpine modules: `src/frontend/alpine/admin-models.ts`, `admin.ts`, `admin-templates.ts`.
- Do NOT hard-delete on discovery mismatch — archive first, removal is explicit admin action.

## Files

- `src/db/migrations/0XX_lora_annotation.ts` — annotation table
- `src/generation/lora/` — annotation routes + service
- `src/frontend/alpine/admin-models.ts` — LoRA list with annotation fields
- `docs/frontend/admin.md` — admin LoRA section update