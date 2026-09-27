<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Licensing

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Low

## Summary

End-to-end licensing model for loop-lore: project source license (Apache-2.0), per-feature license gates (NSFW / commercial-use / age-gated), per-asset license attribution, and per-character-card licensing metadata. The licensing surface is enforced at three boundaries: build (SPDX headers), runtime (license gates on routes + features), and export (license strings in `.llchat` / `.llworld`).

**Context:** The Apache-2.0 license header is already enforced by `scripts/check-parallel.mjs`. This epic adds the **runtime** and **export** layers, plus per-character licensing metadata that SillyTavern / RisuAI do not carry but loop-lore needs to attribute assets correctly. The model is defined in `docs/spec/licensing.md`.

## Scope

### License types (per-feature gates)

- `apache-2.0` — project source (default)
- `cc-by-4.0` — community-contributed lorebooks / world bundles
- `cc-by-nc-4.0` — non-commercial community assets
- `cc-by-nd-4.0` — no-derivatives community assets
- `proprietary-all-rights-reserved` — operator-uploaded proprietary assets
- `nsfw-gated` — age-gated content; runtime gate `NSFW_CONTENT_RATING` must be enabled
- `commercial-gated` — operator feature flag `commercial_use_enabled`

### Enforcement boundaries

- **Build:** `scripts/check-parallel.mjs` license step verifies every `.ts` / `.md` carries an SPDX header matching its location (Apache-2.0 + Loop Lore Contributors).
- **Runtime:** middleware in `src/middleware/license-gate.ts` rejects requests that touch a feature whose license is not enabled in `src/config/license.ts`.
- **Export:** `FormatHeader` from `epic-io-formats.md` includes a `licenses: string[]` field listing every license present in the payload; readers warn on incompatible combinations.
- **Per-asset:** `assets.license` column (string) + `assets.license_url`; gallery UI surfaces the license badge.

### Audit

- `GET /api/admin/licenses` lists every licensed artifact with owner, license, expiry (if any), and last-used timestamp.
- Re-licensing (e.g. CC-BY → proprietary) writes an immutable `audit_events` row.

### Out of scope

- DRM / encryption of licensed assets (handled by `epic-encryption-workflow.md`).
- Per-user license customization (operator-only for now).

## Acceptance Criteria

- [ ] `src/middleware/license-gate.ts` blocks access to features whose license flag is off; tests cover each gate.
- [ ] `assets.license` + `assets.license_url` columns + migration; UI badge wired.
- [ ] `FormatHeader.licenses[]` field populated by every codec in `epic-io-formats.md`.
- [ ] `/api/admin/licenses` lists all licensed artifacts with expiry + last-used.
- [ ] License re-licensing writes an `audit_events` row.
- [ ] `bun run license:check` green (already enforced); per-asset lint rejects missing license on user uploads.

## Related Epics

- `docs/spec/licensing.md`
- `epic-io-formats.md` — FormatHeader.licenses[]
- `epic-encryption-workflow.md` — DRM boundary
- `epic-nsfw-capabilities.md` — `nsfw-gated` license interacts with NSFW rating
- `epic-frontend-gallery.md` — license badge UI

## Tickets

