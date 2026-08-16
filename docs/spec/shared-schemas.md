<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Shared Schemas — Reputation, Consent, NSFW Content Rating

## Overview

Three shared schemas are needed across multiple epics but lack a unified definition:

1. **ReputationScore** — Social, Faction, and NSFW all define reputation differently
2. **ConsentState** — NSFW consent mechanics need integration with Chat Lifecycle moderation
3. **NSFWContentRating** — Character Core defines 5-tier rating but no runtime enforcement contract

## Shared Data Contracts

### 1. Unified ReputationScore Schema

```typescript
// Unified Reputation Score — used by Social, Faction, and NSFW
interface ReputationScore {
  value: number; // -100 to +100
  tier: "hostile" | "unfriendly" | "neutral" | "friendly" | "allied" | "devoted";
  source: "social" | "faction" | "nsfw" | "combined";
  last_modified: Date;
  decay_rate: number; // per day
  modifiers: ReputationModifier[];
}

interface ReputationModifier {
  source: string; // what caused the change
  amount: number; // + or -
  timestamp: Date;
  reason: string;
  context?: Record<string, unknown>; // additional context (encounter_id, etc.)
}

// Tier mapping
const REPUTATION_TIERS = {
  hostile: { min: -100, max: -51, },
  unfriendly: { min: -50, max: -21, },
  neutral: { min: -20, max: 20, },
  friendly: { min: 21, max: 50, },
  allied: { min: 51, max: 75, },
  devoted: { min: 76, max: 100, },
} as const;
```

**Migration Plan**:

- Social: Replace `ReputationScore` with unified schema
- Faction: Replace `FactionStanding` with unified schema
- NSFW: Replace `reputation_change` with unified schema

### 2. Unified ConsentState Schema

```typescript
// Unified Consent State — used by NSFW and Chat Lifecycle
interface ConsentState {
  consent_required: boolean; // Always true for NSFW
  consent_given: boolean; // Explicit yes/no
  consent_aware: boolean; // Does subject know they're affected?
  consent_timestamp: Date;
  consent_revocable: boolean; // Can be revoked
  consent_scope: string[]; // What actions are covered
  audit_trail: ConsentAuditEntry[];
}

interface ConsentAuditEntry {
  timestamp: Date;
  actor: string; // who gave/rejected
  action: "given" | "revoked" | "modified" | "overridden";
  reason?: string;
  moderator?: string; // if admin override
  context?: Record<string, unknown>; // encounter_id, chat_id, etc.
}
```

**Integration Plan**:

- Chat Lifecycle: Add `ConsentState` to NSFW toggle
- NSFW: Replace existing consent fields with `ConsentState`
- Add audit trail for all consent actions

### 3. NSFWContentRating Enforcement Contract

```typescript
// NSFW Content Rating — enforced at generation boundary
enum NSFWContentRating {
  SFW = "sfw",
  NSFW_MILD = "nsfw_mild",
  NSFW_MODERATE = "nsfw_moderate",
  NSFW_INTENSE = "nsfw_intense",
  NSFW_EXTREME = "nsfw_extreme",
}

interface NSFWRatingEnforcement {
  character_rating: NSFWContentRating;
  user_preference: NSFWContentRating;
  chat_setting: NSFWContentRating;
  effective_limit: NSFWContentRating; // min of all three
  enforcement_point: "generation" | "render" | "storage";
  bypass_allowed: boolean;
  bypass_reason?: string;
  enforced_at: Date;
  enforced_by: string;
}

// Rating hierarchy (higher = more permissive)
const NSFW_RATING_HIERARCHY = [
  NSFWContentRating.NSFW_EXTREME,
  NSFWContentRating.NSFW_INTENSE,
  NSFWContentRating.NSFW_MODERATE,
  NSFWContentRating.NSFW_MILD,
  NSFWContentRating.SFW,
] as const;
```

**Enforcement Plan**:

- Generation boundary: Check effective_limit before LLM request
- Render boundary: Filter content based on user preference
- Storage boundary: Tag content with rating
- Bypass: Admin override with audit trail

## Integration Points

### Systems This Epic Depends On

| System         | What It Provides                   | How Used                           |
| -------------- | ---------------------------------- | ---------------------------------- |
| Character Core | NSFW content rating, relationships | Content rating enforcement         |
| Chat Lifecycle | NSFW toggle, moderation            | Consent enforcement, rating gating |
| Social         | Reputation model                   | Unified reputation schema          |
| Faction        | Reputation model                   | Unified reputation schema          |

### Systems That Depend On This Epic

| System        | What It Consumes            | How Used                                |
| ------------- | --------------------------- | --------------------------------------- |
| NSFW          | Consent, reputation, rating | Encounter mechanics, seduction checks   |
| Economy       | Reputation for pricing      | Merchant discounts, black market access |
| Battle        | Reputation for NPC behavior | Enemy surrender, ally coordination      |
| Analytics     | Consent and rating events   | Safety dashboard, compliance reporting  |
| Plugin System | Schema contracts            | Custom content validation               |

### Cross-System Events

| Event                  | Direction | Purpose                      |
| ---------------------- | --------- | ---------------------------- |
| `consent.given`        | emits     | Enable NSFW encounter        |
| `consent.revoked`      | emits     | Disable NSFW encounters      |
| `reputation.changed`   | emits     | Update all dependent systems |
| `nsfw.rating.enforced` | emits     | Block/allow generation       |
| `nsfw.content.flagged` | emits     | Trigger moderation queue     |

## Migration Strategy

### Social System

- Replace existing `ReputationScore` with unified schema
- Update reputation change mechanics to use unified schema
- Add decay/refresh mechanics
- Update all UI components to use unified schema

### Faction System

- Replace `FactionStanding` with unified schema
- Update faction reputation mechanics
- Add faction-specific modifiers
- Update all faction-related UI components

### NSFW System

- Replace existing consent fields with `ConsentState`
- Add audit trail for all consent actions
- Integrate content rating enforcement
- Update all NSFW encounter mechanics

### Chat Lifecycle System

- Add `ConsentState` to NSFW toggle
- Add content rating enforcement
- Add moderation audit trail
- Update all moderation workflows

## Testing Strategy

### Schema Validation Tests

- Test reputation score calculations
- Test consent state transitions
- Test rating enforcement logic

### Integration Tests

- Test Social + NSFW reputation changes
- Test Chat Lifecycle + NSFW consent
- Test Character Core + NSFW rating enforcement

### Migration Tests

- Test Social schema migration
- Test Faction schema migration
- Test NSFW schema migration

## Technical Considerations

- **Backward Compatibility**: Migration must preserve existing data
- **Performance**: Schema validation must not slow down critical paths
- **Audit Trail**: All consent and moderation actions must be logged
- **Compliance**: Content rating enforcement must be runtime-enforced
- **Extensibility**: Schemas must support plugin extensions

## Files

- `src/schemas/reputation.ts` — Unified reputation schema
- `src/schemas/consent.ts` — Unified consent schema
- `src/schemas/nsfw-rating.ts` — NSFW content rating schema
- `src/schemas/index.ts` — Schema exports
- `src/db/schema-shared.ts` — Shared database tables
- `src/routes/schemas.ts` — Schema API endpoints
- `docs/spec/shared-schemas.md` — Schema documentation

## Open Questions

### Schema Design

- Should schemas be versioned?
- How to handle schema extensions from plugins?
- Should schemas support internationalization?
- How to handle schema evolution?

### Integration Complexity

- Should integration be tight (shared code) or loose (API calls)?
- How to handle performance-critical paths?
- Should there be fallback behavior when schemas are unavailable?
- How to handle compatibility between different schema versions?

### Compliance & Safety

- How to handle underage users?
- What's the content rating enforcement strategy?
- How to handle illegal content?
- What's the reporting mechanism?

## Success Metrics

- **Technical**
  - All schemas unified
  - Migration complete
  - Runtime enforcement working
  - Audit trail functional

- **Compliance**
  - 100% consent tracking
  - Content rating enforcement
  - Audit trail complete
  - Moderation tools functional

- **Integration**
  - Social + NSFW reputation working
  - Chat Lifecycle + NSFW consent working
  - Character Core + NSFW rating working
