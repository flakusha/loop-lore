# Licensing Specification

**Status:** Draft
**Date:** 2026-07-28
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

Defines legal-grade license definitions, enforcement rules, and compliance workflows for character data, content, and derivatives within the loop-lore platform.

---

## 1. License Types

### Standard Licenses

| License                 | Code         | Rights Granted                                                             | Restrictions                        |
| ----------------------- | ------------ | -------------------------------------------------------------------------- | ----------------------------------- |
| **CC0 (Public Domain)** | `CC0`        | Full commercial use, modification, redistribution, no attribution required | None                                |
| **CC BY 4.0**           | `CC_BY`      | Commercial use, modification, redistribution, **attribution required**     | Must credit original creator        |
| **CC BY-SA 4.0**        | `CC_BY_SA`   | Commercial use, modification, redistribution, attribution, **share-alike** | Derivatives must use same license   |
| **CC BY-NC 4.0**        | `CC_BY_NC`   | Non-commercial use, modification, redistribution, attribution              | No commercial use of character/data |
| **All Rights Reserved** | `ALL_RIGHTS` | No redistribution or modification without explicit permission              | Full copyright protection           |

### Platform-Specific Licenses

| License                | Code       | Description                                                                                      |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| **Platform License**   | `PLATFORM` | Content is licensed to the platform for hosting, display, and serving; creator retains copyright |
| **Derivative License** | `DERIVED`  | AI-generated derivatives of character data are licensed under the same terms as the source       |

---

## 2. License Assignment

### Default License

New characters and assets are assigned `ALL_RIGHTS` by default unless explicitly set otherwise during creation.

```typescript
interface LicenseAssignment {
  license: LicenseType;
  assigned_by: actor_id;
  assigned_at: timestamp;
  source: "creator" | "admin" | "import" | "default";
  notes?: string;
}
```

### License Override

Admins and content owners can override licenses:

| Actor           | Can Assign            | Can Override                                                   |
| --------------- | --------------------- | -------------------------------------------------------------- |
| Creator         | Own characters/assets | Own characters/assets only                                     |
| Admin           | Any character/asset   | Any — including stripping creator's CC BY-SA                   |
| System (import) | Imported content      | Respects source license if specified; defaults to `ALL_RIGHTS` |

### License Hierarchy

When content has multiple license layers (e.g., base character CC0 + derivative artwork CC BY-SA):

1. **Most restrictive** license applies to the combined work
2. Attribution is always required for any non-CC0 license
3. Derivatives inherit the most restrictive license of any component

---

## 3. License Enforcement

### API-Level Enforcement

| Check                   | When                  | Action                                           |
| ----------------------- | --------------------- | ------------------------------------------------ |
| License validation      | Content upload/import | Reject if license key is invalid or unauthorized |
| Attribution check       | Content distribution  | Include license and attribution in API responses |
| Share-alike enforcement | Derivative creation   | Flag derivatives that don't match source license |
| NC compliance           | Commercial use        | Block commercial use of NC-licensed content      |

### Admin Enforcement

| Capability      | Description                                                            |
| --------------- | ---------------------------------------------------------------------- |
| License audit   | List all content with license type, attribution status, and compliance |
| License change  | Admin can override licenses for compliance or legal reasons            |
| Takedown        | Remove content that violates license terms or legal requirements       |
| License dispute | Flag a character/asset as under license dispute; restrict distribution |

---

## 4. Attribution Requirements

### Attribution Format

All non-CC0 content must include attribution when served or redistributed:

```json
{
  "license": "CC BY 4.0",
  "attribution": {
    "creator": "ActorName",
    "source_url": "https://example.com/characters/uuid",
    "license_url": "https://creativecommons.org/licenses/by/4.0/",
    "attribution_text": "Character by ActorName, CC BY 4.0"
  }
}
```

### Attribution in Responses

API responses for licensed content must include:

| Field                     | Value                         |
| ------------------------- | ----------------------------- |
| `license`                 | License type code             |
| `attribution.creator`     | Creator actor name            |
| `attribution.license_url` | URL to license deed           |
| `attribution.source_url`  | URL to source character/asset |

---

## 5. Compliance Workflow

### Content Import

1. Import wizard detects license from source metadata or prompts for it
2. License is validated against the platform's recognized list
3. Attribution is collected (creator name, source URL)
4. Content is stored with license and attribution metadata
5. Compliance check runs: NC content blocked from commercial contexts, SA derivatives checked

### Content Export

1. Export includes license metadata and attribution block
2. CC0 content exported without attribution requirements
3. CC BY content exported with attribution block
4. CC BY-SA content exported with attribution + license copy
5. NC content export is flagged with a compliance warning

### Regular Audits

| Audit Type           | Frequency   | Scope                                                   |
| -------------------- | ----------- | ------------------------------------------------------- |
| License compliance   | Monthly     | All characters/assets with non-CC0 licenses             |
| Attribution accuracy | Quarterly   | Check that attribution URLs are still valid             |
| NC compliance        | Per-request | Check commercial use claims against NC-licensed content |
| Dispute resolution   | As needed   | Adjudicate license disputes and takedown requests       |

---

## 6. License Enforcement API

| Method | Path                               | Description                                               |
| ------ | ---------------------------------- | --------------------------------------------------------- |
| GET    | `/api/licensing/compliance-report` | Generate compliance report for all content                |
| POST   | `/api/licensing/check`             | Validate a license key and return compliance status       |
| GET    | `/api/licensing/attribution/:id`   | Get attribution info for a character/asset                |
| POST   | `/api/licensing/override/:id`      | Admin override of a license                               |
| POST   | `/api/licensing/dispute/:id`       | Flag content as under license dispute                     |
| POST   | `/api/licensing/takedown/:id`      | Remove content for legal reasons (requires justification) |

---

## Cross-References

- `docs/spec/character-spec.md` — character licensing section references this spec
- `docs/spec/import-export-io.md` — import/export must carry license metadata
- `.plan/epics/epic-character-core-system.md` — licensing admin management
- `src/licensing/` — licensing enforcement service (to be implemented)
- `src/routes/licensing.ts` — licensing API routes (to be implemented)
