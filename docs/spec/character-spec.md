<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Character Specification — Unified Setup API

**Status:** Draft
**Supersedes:** `docs/spec/character-spec.md` (canonical fields section)
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the unified character specification for loop-lore:
a single source of truth for mandatory fields, optional fields, multi-level
object descriptions, format conversion, validation modes, and the API that
serves character data across the system.

---

## 1. Mandatory vs Optional Fields

### 1.1 Mandatory Fields (Required for All Characters)

| Field         | Type     | Description                            | Constraints                                      |
| ------------- | -------- | -------------------------------------- | ------------------------------------------------ |
| `name`        | `string` | Character display name                 | `1 ≤ length ≤ 64`, trimmed, non-empty after trim |
| `description` | `string` | Full character description / backstory | `1 ≤ length ≤ 5000`, trimmed                     |
| `personality` | `string` | Personality summary (immutable core)   | `1 ≤ length ≤ 2000`, trimmed                     |

### 1.2 Optional Fields

| Field                       | Type             | Default | Description                     | Constraints                       |
| --------------------------- | ---------------- | ------- | ------------------------------- | --------------------------------- |
| `nickname`                  | `string \| null` | `null`  | Alternative name                | `≤ 64` if set                     |
| `scenario`                  | `string`         | `""`    | RP setting / context            | `≤ 5000`                          |
| `welcome_message`           | `string`         | `""`    | First message to user           | `≤ 5000`                          |
| `mes_example`               | `string`         | `""`    | Example dialogue                | `≤ 10000`                         |
| `system_prompt`             | `string`         | `""`    | System prompt override          | `≤ 10000`                         |
| `post_history_instructions` | `string`         | `""`    | Instructions after chat history | `≤ 5000`                          |
| `alternate_greetings`       | `string[]`       | `[]`    | Alternative welcome messages    | `≤ 10` entries, each `≤ 5000`     |
| `tags`                      | `string[]`       | `[]`    | Classification tags             | `≤ 20` entries, each `≤ 32` chars |
| `creator`                   | `string`         | `""`    | Creator name                    | `≤ 64`                            |
| `creator_notes`             | `string`         | `""`    | Creator notes                   | `≤ 2000`                          |
| `character_version`         | `string`         | `"1.0"` | Creator's version string        | Semver-ish, `≤ 16`                |

### 1.3 Multi-Level Object Descriptions

Characters support nested, structured descriptions through the `description`
field and the `extensions` map. The `description` is a flat string for
compatibility, but `extensions` allows structured, multi-level data:

```typescript
interface CharacterExtensions {
  /** Genre-specific stat blocks (optional, plugin-defined) */
  stats?: Record<string, number>;
  /** Inventory items (optional) */
  inventory?: InventoryItem[];
  /** Relationships to other characters (optional) */
  relationships?: CharacterRelationship[];
  /** World/location-specific modifiers (optional) */
  world_modifiers?: WorldModifier[];
  /** Custom plugin data (any shape) */
  [key: string]: unknown;
}

interface InventoryItem {
  id: string;
  name: string;
  type: string;
  description: string;
  quantity: number;
  equipped: boolean;
  metadata?: Record<string, unknown>;
}

interface CharacterRelationship {
  target_character_id: string;
  type: "friend" | "rival" | "ally" | "enemy" | "family" | "mentor" | "student" | "neutral";
  strength: number; // 0-100
  notes: string;
}

interface WorldModifier {
  world_id: string;
  type: "speech" | "behavior" | "emotional" | "social" | "quirk_suppression";
  description: string;
  active: boolean;
}
```

**Design rationale:** The `extensions` map is a catch-all for any plugin or
game-rule system to attach structured data without schema changes. The core
spec only defines the flat fields above; everything else lives in
`extensions`.

**Behavioral dimensions** (coping, approach, autonomy) are **not** extensions —
they are first-class fields on `CanonicalCharacter` defined in
`epic-character-internal-traits.md` (D7–D9). They use the same visibility model
as internal traits and aspirations (`visible | hidden`) and are injected into
the LLM prompt via `actorInternalSection`. See the epic for full schema,
prompt assembly rules, and integration with mood/relationships.

---

## 2. NSFW Content Rating

### 2.1 Content Rating Values

| Rating          | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `sfw`           | Safe for work, no adult content                             |
| `nsfw_mild`     | Mild adult themes (romance, mild violence)                  |
| `nsfw_moderate` | Moderate adult content (explicit violence, strong language) |
| `nsfw_intense`  | Intense adult content (sexual content, graphic violence)    |
| `nsfw_extreme`  | Extreme adult content (no restrictions)                     |

### 2.2 NSFW Fields

| Field              | Type                 | Default | Description             |
| ------------------ | -------------------- | ------- | ----------------------- |
| `content_rating`   | `ContentRating` enum | `"sfw"` | Content classification  |
| `nsfw_categories`  | `string[]`           | `[]`    | Allowed NSFW categories |
| `nsfw_hard_limits` | `string[]`           | `[]`    | Never-allowed content   |

### 2.3 Content Rating Propagation

Content rating is enforced at three levels:

1. **Character creation** — the `content_rating` field is set and validated.
2. **Chat context** — when a character is used in a chat, the chat's
   `allowed_age` is compared against the character's `content_rating`.
   Characters with a rating higher than `allowed_age` are hidden or
   blocked from selection.
3. **Age verification** — users below the required age for a character's
   rating cannot initiate or continue chats with that character.

| Rating          | Minimum Age |
| --------------- | ----------- |
| `sfw`           | None        |
| `nsfw_mild`     | 13+         |
| `nsfw_moderate` | 18+         |
| `nsfw_intense`  | 18+         |
| `nsfw_extreme`  | 18+         |

---

## 3. Impersonation Rules

### 3.1 Core Rules

| Context          | Rule                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Private chat** | Only one actor can impersonate one character at a time. Impersonation ends when the user leaves the chat. |
| **Group chat**   | Impersonation is allowed. Each user can impersonate at most one character simultaneously.                 |
| **GM/Assistant** | Can impersonate any character in any context.                                                             |
| **User**         | Can only impersonate their own characters (or characters with `visibility="public"`).                     |
| **LLM Review**   | Can view impersonation state but cannot initiate it.                                                      |

### 3.2 De-Impersonation

- When a user leaves a chat, all impersonation state is cleared and the
  impersonated character becomes available for impersonation again.
- Explicit de-impersonation is also available via the API:
  `POST /api/characters/:id/deimpersonate`.

---

## 4. Format Conversion Logic

### 4.1 Storage Format

All characters are stored internally as **JSON** in the database. The
`actors` table stores the canonical character card as a JSON column.

**Internal JSON schema** (the canonical form):

```json
{
  "spec": "loop-lore/v1",
  "data": {
    "name": "",
    "description": "",
    "personality": "",
    "scenario": "",
    "welcome_message": "",
    "mes_example": "",
    "system_prompt": "",
    "post_history_instructions": "",
    "alternate_greetings": [],
    "tags": [],
    "creator": "",
    "creator_notes": "",
    "character_version": "1.0",
    "nickname": null,
    "content_rating": "sfw",
    "nsfw_categories": [],
    "nsfw_hard_limits": [],
    "extensions": {}
  }
}
```

### 4.2 YAML and TOML as First-Class Citizens

YAML and TOML are treated as **first-class storage formats** alongside JSON.
When a character is created or updated via the API, the client can specify
the storage format. The server stores the raw source in a separate column
(`data_source_format`) and the canonical JSON in the main `data` column.

**Supported storage formats:**

| Format | Extension       | Storage Column |
| ------ | --------------- | -------------- |
| JSON   | `.json`         | `data_json`    |
| YAML   | `.yaml`, `.yml` | `data_yaml`    |
| TOML   | `.toml`         | `data_toml`    |

When the API returns a character, it returns the canonical JSON regardless
of the storage format. The raw source is available via a separate endpoint
for export.

### 4.3 Import/Export Formats

| Format         | Direction       | Notes                       |
| -------------- | --------------- | --------------------------- |
| JSON (V2)      | Import → Export | Standard API format         |
| JSON (V3)      | Import → Export | With assets support         |
| YAML           | Import → Export | Human-readable, first-class |
| TOML           | Import → Export | Config-style, first-class   |
| PNG (V2+V3)    | Import only     | SillyTavern cards           |
| CHARX (V3 ZIP) | Import only     | Async processing            |
| Character.AI   | Import only     | Migration source            |

### 4.4 CHARX V3 Bundle Handling

CHARX V3 bundles are processed **asynchronously**:

1. Upload triggers a background job.
2. The job extracts `card.json` and assets from the ZIP.
3. Assets are uploaded to the asset system and linked via `asset_links`.
4. The character card is normalized and stored.
5. The frontend receives a `202 Accepted` with a job ID.
6. The frontend polls `GET /api/characters/import/:jobId` for status.

This means CHARX imports do not block the request/response cycle and the
frontend does not need to wait for completion.

---

## 5. API Design

### 5.1 Validation Modes

The API supports two validation modes, configured per-server or per-admin
preference:

| Mode        | Description                                                                              | Behavior                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **strict**  | All mandatory fields must be present and valid                                           | Rejects invalid characters with detailed error messages                     |
| **relaxed** | Mandatory fields are enforced; optional fields are accepted if present but not validated | Accepts characters with missing or malformed optional fields, logs warnings |

The validation mode is set via the `X-Validation-Mode` header or the
`validationMode` query parameter. The default is `strict`.

### 5.2 Single IO Endpoints

| Method   | Endpoint                     | Description                          |
| -------- | ---------------------------- | ------------------------------------ |
| `GET`    | `/api/characters`            | List user's characters (paginated)   |
| `POST`   | `/api/characters`            | Create a single character            |
| `GET`    | `/api/characters/:id`        | Get character details                |
| `PUT`    | `/api/characters/:id`        | Update a character                   |
| `DELETE` | `/api/characters/:id`        | Delete a character                   |
| `GET`    | `/api/characters/:id/export` | Export character in specified format |

### 5.3 Bulk IO Endpoints

| Method   | Endpoint                        | Description                                            |
| -------- | ------------------------------- | ------------------------------------------------------ |
| `POST`   | `/api/characters/bulk`          | Create multiple characters in one request              |
| `PUT`    | `/api/characters/bulk`          | Update multiple characters in one request              |
| `DELETE` | `/api/characters/bulk`          | Delete multiple characters in one request              |
| `POST`   | `/api/characters/import`        | Import from file (multipart, single or multiple files) |
| `POST`   | `/api/characters/import/url`    | Import from URL (JSON body: `{url}`)                   |
| `GET`    | `/api/characters/import/:jobId` | Check import job status (for async CHARX)              |

### 5.4 Review Workflow

Character cards go through a review pipeline with four roles:

| Role                      | Permission                                                     |
| ------------------------- | -------------------------------------------------------------- |
| **Admin**                 | Full CRUD, approve/reject any character                        |
| **Moderator**             | Approve/reject characters, view all                            |
| **User**                  | Create/edit own characters, request review                     |
| **LLM (Main/AUX/Review)** | Suggest edits, flag issues, auto-approve if confidence is high |

**Review states:**

| State            | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `draft`          | Character is being created/edited, not yet submitted |
| `pending_review` | Submitted for review, awaiting approval              |
| `approved`       | Approved and available for use                       |
| `rejected`       | Rejected with feedback                               |
| `archived`       | Removed from active use but retained for reference   |

**Review transitions:**

```
draft → pending_review → approved | rejected
rejected → draft (edit and resubmit)
approved → archived (soft delete)
```

### 5.5 Review Window API

| Method | Endpoint                            | Description                    |
| ------ | ----------------------------------- | ------------------------------ |
| `POST` | `/api/characters/:id/submit-review` | Submit character for review    |
| `GET`  | `/api/characters/review/pending`    | List characters pending review |
| `POST` | `/api/characters/:id/approve`       | Approve character              |
| `POST` | `/api/characters/:id/reject`        | Reject character with feedback |
| `GET`  | `/api/characters/:id/review-log`    | Get review history             |

---

## 6. Multi-Language Support

### 6.1 Translation Fields

Character fields that contain user-facing text support translations via a
`translations` map:

```typescript
interface LocalizedFields {
  name?: Record<string, string>; // key: locale code (e.g. "en", "ja", "fr")
  description?: Record<string, string>;
  personality?: Record<string, string>;
  scenario?: Record<string, string>;
  welcome_message?: Record<string, string>;
  mes_example?: Record<string, string>;
  system_prompt?: Record<string, string>;
  post_history_instructions?: Record<string, string>;
  alternate_greetings?: Record<string, string[]>;
  creator_notes?: Record<string, string>;
}
```

### 6.2 Auto-Spec Translations

The system supports automatic translation of character specs:

1. **On import** — if a character file contains a `translations` field, the
   system stores all locales.
2. **On export** — the system can export with a specific locale or all
   locales.
3. **On creation** — the user can provide translations for any text field.
4. **Reconciliation** — if a translation is missing for a locale, the system
   falls back to the default (English) and flags the gap.

### 6.3 Locale Configuration

Supported locales are configured server-side:

```typescript
interface LocaleConfig {
  default_locale: string; // e.g. "en"
  supported_locales: string[]; // e.g. ["en", "ja", "fr", "de", "es"]
  fallback_locale: string; // e.g. "en"
}
```

---

## 7. World / Style Validations

### 7.1 World-Level Validation

Worlds can enforce validation rules on characters used within them:

```typescript
interface WorldValidationRules {
  world_id: string;
  /** Which content ratings are allowed in this world */
  allowed_content_ratings: ContentRating[];
  /** Maximum description length for characters in this world */
  max_description_length: number;
  /** Required fields beyond the global mandatory set */
  required_fields: string[];
  /** Forbidden tags */
  forbidden_tags: string[];
  /** Custom field validators (plugin-defined) */
  custom_validators?: CustomValidator[];
}
```

### 7.2 Style Validation

Worlds can also define a "style" that constrains character expression:

```typescript
interface WorldStyleRules {
  world_id: string;
  /** Speech style enforcement */
  speech_style: "formal" | "informal" | "neutral" | "custom";
  /** Allowed personality traits (if defined) */
  allowed_personality_traits?: string[];
  /** Forbidden personality traits */
  forbidden_personality_traits?: string[];
  /** Custom expression modifiers */
  expression_modifiers?: Record<string, unknown>;
}
```

### 7.3 Opt-In Combinations

Characters can opt into or out of specific feature combinations:

```typescript
interface CharacterFeatureFlags {
  /** Enable RPG mechanics (stats, combat, skills) */
  rpg_mechanics?: boolean;
  /** Enable inventory system */
  inventory?: boolean;
  /** Enable relationship system */
  relationships?: boolean;
  /** Enable mood/happiness system */
  mood?: boolean;
  /** Enable trait system */
  traits?: boolean;
  /** Enable lorebook */
  lorebook?: boolean;
  /** Enable asset system */
  assets?: boolean;
  /** Enable NSFW content */
  nsfw?: boolean;
}
```

These flags are stored in `extensions` and are used by the system to
determine which subsystems are active for a given character. When a world
or story uses a character, it only activates the subsystems that the
character has opted into.

---

## 8. Game Rules / Mechanics Config

### 8.1 Plugin Bundle Presets

Game rules and mechanics are defined via **plugin bundles** — configuration
files that describe how stats, skills, and actions work for a specific genre
or setting:

```yaml
# Example: fantasy RPG bundle
bundle:
  id: fantasy-rpg
  name: Fantasy RPG
  version: "1.0"

  stats:
    - name: strength
      label: Strength
      description: Melee damage, carry weight
      min: 0
      max: 20
      default: 10
    - name: dexterity
      label: Dexterity
      description: Evasion, ranged attacks
      min: 0
      max: 20
      default: 10

  skills:
    - name: swordsmanship
      label: Swordsmanship
      description: Combat with melee weapons
      stat: strength
      level_cap: 100

  actions:
    - name: attack
      label: Attack
      description: Strike with a weapon
      requires: [swordsmanship]
      damage_stat: strength
```

### 8.2 Config-Driven vs Hardcoded

| Approach          | Use Case                                         | Example                                         |
| ----------------- | ------------------------------------------------ | ----------------------------------------------- |
| **Config-driven** | Genre bundles, world rules, content policies     | `bundles/fantasy-rpg.yaml`                      |
| **Hardcoded**     | Core mechanics, validation logic, security rules | Content rating enforcement, impersonation rules |

New game rules can be introduced via config files without code changes.
The system loads plugin bundles at startup and makes them available to
characters and worlds.

### 8.3 Character-Plugin Integration

A character can reference a plugin bundle to inherit its rules:

```json
{
  "extensions": {
    "plugin_bundle": "fantasy-rpg",
    "stats": { "strength": 15, "dexterity": 8 },
    "skills": { "swordsmanship": 45 }
  }
}
```

---

## 9. Migration System

### 9.1 Version Migration

Characters can be migrated between spec versions. The migration system
auto-fills fields where possible and warns on fields that cannot be
automatically populated.

**Migration flow:**

1. User selects a source spec version (e.g., V2) and target version (V3).
2. The system maps all compatible fields automatically.
3. For V3-specific fields (e.g., `assets`, `nickname`, `extensions`), the
   system checks if they can be populated from the source data.
4. If all V3 required checks pass, the character is marked as V3-ready.
5. If checks fail, the system warns which fields need manual completion.

### 9.2 Migration Status

| Status               | Description                                         |
| -------------------- | --------------------------------------------------- |
| `migration-ready`    | All V3 fields can be auto-populated from V2         |
| `migration-partial`  | Some V3 fields need manual completion               |
| `migration-blocked`  | V3 migration cannot proceed (missing required data) |
| `migration-complete` | Character has been successfully migrated to V3      |

### 9.3 Migration API

| Method | Endpoint                               | Description                               |
| ------ | -------------------------------------- | ----------------------------------------- |
| `POST` | `/api/characters/:id/migrate`          | Initiate migration to latest spec version |
| `GET`  | `/api/characters/:id/migration-status` | Check migration progress and status       |
| `GET`  | `/api/characters/:id/migration-report` | Get detailed migration report             |

---

## 10. LSP / IDE Support

The character spec is designed to work with LSP highlighting in frontend
text edit fields. YAML and TOML files for character definitions should be
parseable by standard language servers, and the JSON canonical form should
be compatible with JSON Schema validation.

### 10.1 JSON Schema

A JSON Schema for the canonical character card is published at
`/schemas/character-card.json` and can be used by IDEs for autocompletion
and validation.

---

## 11. Implementation Notes

### 11.1 Files to Create / Modify

| File                                | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `src/characters/spec.ts`            | Canonical character type definitions and validation       |
| `src/characters/validator.ts`       | Strict and relaxed validation modes                       |
| `src/characters/locale.ts`          | Multi-language translation support                        |
| `src/characters/extensions.ts`      | Extension point definitions (stats, inventory, etc.)      |
| `src/characters/migration.ts`       | Version migration logic                                   |
| `src/characters/review.ts`          | Review workflow state machine                             |
| `src/characters/validator-rules.ts` | World/style validation rules                              |
| `src/routes/characters.ts`          | Updated routes with bulk IO, review, and validation modes |
| `src/routes/character-import.ts`    | Async import routes for CHARX and bulk operations         |
| `schemas/character-card.json`       | JSON Schema for IDE/LSP support                           |

### 11.2 Dependencies

Already in `package.json`:

- `js-yaml` — YAML parsing

No new dependencies required for the core spec.

### 11.3 Testing Strategy

| Test File                                | Coverage                                                      |
| ---------------------------------------- | ------------------------------------------------------------- |
| `src/characters/spec.test.ts`            | Mandatory/optional field validation, multi-level descriptions |
| `src/characters/validator.test.ts`       | Strict vs relaxed validation modes                            |
| `src/characters/locale.test.ts`          | Translation fields, locale fallback                           |
| `src/characters/migration.test.ts`       | Version migration, auto-fill, readiness checks                |
| `src/characters/review.test.ts`          | Review workflow state transitions                             |
| `src/characters/validator-rules.test.ts` | World/style validation rules                                  |
| `src/characters/integration.test.ts`     | Full import → validate → store → export pipeline              |

---

## Reference

| Document                                    | Covers                                                                |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `docs/spec/character-spec.md`               | Legacy character setup spec (format support, import/export pipelines) |
| `docs/spec/personas.md`                     | Persona system and impersonation                                      |
| `docs/spec/rpg-mechanics.md`                | RPG stat system and plugin bundles                                    |
| `docs/spec/plugin-system.md`                | Plugin architecture and hook definitions                              |
| `docs/schema.md`                            | Database schema, all tables                                           |
| `docs/frontend/characters.md`               | Character list and edit UI                                            |
| `.plan/epics/epic-character-core-system.md` | Character core system epic                                            |
