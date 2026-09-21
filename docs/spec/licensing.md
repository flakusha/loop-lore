<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Licensing Specification

Status: Partially implemented — **not** "to be implemented": `src/routes/character-licensing` is registered (see `register-plugins.ts`) and `src/characters/license-enforcement.ts` exists.

## Implemented

- License types (codes): `CC0`, `CC_BY`, `CC_BY_SA`, `CC_BY_NC`, `ALL_RIGHTS`; platform-specific `PLATFORM` (hosting/display license, creator retains copyright) and `DERIVED` (derivatives inherit source terms).
- Default assignment: `ALL_RIGHTS` unless set at creation; imports respect source license, else `ALL_RIGHTS`.
- Enforcement service: `src/characters/license-enforcement.ts`; API routes under `src/routes/character-licensing`.
- Hierarchy rule: most restrictive layer applies to combined works; attribution required for all non-CC0.

## Not implemented / aspirational

- Admin compliance workflows: audit listings, license override UI, takedown, dispute flagging; scheduled audits (monthly compliance / quarterly attribution-URL checks).
- Full licensing API surface (`/api/licensing/compliance-report|check|attribution/:id|override/:id|dispute/:id|takedown/:id`) beyond what the character-licensing routes cover.
- Attribution block in every content response (`attribution.creator`, `license_url`, `source_url`, `attribution_text`).

## Unique content (license table, compressed)

- CC0: no restrictions. CC BY: commercial OK, attribution required. CC BY-SA: + share-alike. CC BY-NC: non-commercial only, attribution required. ALL_RIGHTS: no reuse without permission.

## Epics

- `.plan/epics/epic-licensing.md`
- `.plan/epics/epic-character-core-system.md` (licensing admin)

## See also

`docs/spec/character-spec.md`, `docs/spec/import-export-io.md` (license metadata on export), `src/characters/license-enforcement.ts`.
