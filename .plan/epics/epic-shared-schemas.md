# EPIC: Shared Schemas — Reputation, Consent, NSFW Content Rating

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** schemas, reputation, consent, nsfw, shared, cross-system

## Summary

Three shared schemas are needed across multiple epics but lack a unified definition:

1. `ReputationScore` — Social, Faction, and NSFW all define reputation differently
2. `ConsentState` — NSFW consent mechanics need integration with Chat Lifecycle moderation
3. `NSFWContentRating` — Character Core defines 5-tier rating but no runtime enforcement contract

## Overview

### Current State Assessment

| Schema              | Systems Using It      | Current State                                           |
| ------------------- | --------------------- | ------------------------------------------------------- |
| `ReputationScore`   | Social, Faction, NSFW | Three different schemas, no shared contract             |
| `ConsentState`      | NSFW, Chat Lifecycle  | NSFW has consent fields, Chat Lifecycle has NSFW toggle |
| `NSFWContentRating` | Character Core        | 5-tier enum defined, no runtime enforcement             |

### Problem Statement

1. **Reputation Fragmentation**: Social defines `ReputationScore` (-100 to +100), Faction defines `FactionStanding` (different range), NSFW defines `reputation_change` (numeric delta). Three incompatible schemas.

2. **Consent Disconnection**: NSFW encounters have `consent_given` and `consent_required` fields, but Chat Lifecycle's NSFW toggle is a simple boolean. No audit trail, no revocation mechanism.

3. **Rating Enforcement Gap**: Character Core defines 5-tier NSFW rating (`sfw`, `nsfw_mild`, `nsfw_moderate`, `nsfw_intense`, `nsfw_extreme`), but there's no runtime enforcement at the generation boundary.

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

### Shared Data Contracts

| Contract                | Shared With                            | Purpose                           |
| ----------------------- | -------------------------------------- | --------------------------------- |
| `ReputationScore`       | Social, Faction, NSFW, Battle, Economy | Unified reputation across systems |
| `ConsentState`          | NSFW, Chat Lifecycle                   | Consent tracking for encounters   |
| `NSFWContentRating`     | Character Core, Chat Lifecycle, NSFW   | Content rating enforcement        |
| `ReputationModifier`    | Social, Faction, NSFW                  | Reputation change tracking        |
| `ConsentAuditEntry`     | NSFW, Chat Lifecycle                   | Consent audit trail               |
| `NSFWRatingEnforcement` | Character Core, Chat Lifecycle, NSFW   | Runtime enforcement               |

### Cross-System Events

| Event                  | Direction | Purpose                      |
| ---------------------- | --------- | ---------------------------- |
| `consent.given`        | emits     | Enable NSFW encounter        |
| `consent.revoked`      | emits     | Disable NSFW encounter       |
| `reputation.changed`   | emits     | Update all dependent systems |
| `nsfw.rating.enforced` | emits     | Block/allow generation       |
| `nsfw.content.flagged` | emits     | Trigger moderation queue     |

## Schema Definitions

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

## Tasks

### Core Schema Implementation (High Priority)

- [ ] **Unified ReputationScore Schema**
  - Define `ReputationScore` interface
  - Define `ReputationModifier` interface
  - Define tier mapping constants
  - Create migration plan for Social, Faction, NSFW
  - Update Social epic to use shared schema
  - Update Faction epic to use shared schema
  - Update NSFW epic to use shared schema

- [ ] **Unified ConsentState Schema**
  - Define `ConsentState` interface
  - Define `ConsentAuditEntry` interface
  - Integration with Chat Lifecycle NSFW toggle
  - Integration with NSFW encounter mechanics
  - Audit trail for consent decisions
  - Revocation mechanism

- [ ] **NSFWContentRating Enforcement Contract**
  - Define `NSFWContentRating` enum
  - Define `NSFWRatingEnforcement` interface
  - Runtime enforcement at generation boundary
  - Content filtering based on rating
  - User preference override with warnings
  - Admin override capability

### Integration (Medium Priority)

- [ ] **Social Integration**
  - Replace existing reputation schema
  - Update reputation change mechanics
  - Add decay/refresh mechanics

- [ ] **Faction Integration**
  - Replace `FactionStanding` with unified schema
  - Update faction reputation mechanics
  - Add faction-specific modifiers

- [ ] **NSFW Integration**
  - Replace existing consent fields
  - Add consent audit trail
  - Integrate content rating enforcement

- [ ] **Chat Lifecycle Integration**
  - Add `ConsentState` to NSFW toggle
  - Add content rating enforcement
  - Add moderation audit trail

### Testing & Validation (Medium Priority)

- [ ] **Schema Validation Tests**
  - Test reputation score calculations
  - Test consent state transitions
  - Test rating enforcement logic

- [ ] **Integration Tests**
  - Test Social + NSFW reputation changes
  - Test Chat Lifecycle + NSFW consent
  - Test Character Core + NSFW rating enforcement

- [ ] **Migration Tests**
  - Test Social schema migration
  - Test Faction schema migration
  - Test NSFW schema migration

## Implementation Notes

### Integration Strategy

1. **Define Schemas First**
   - Create shared schema definitions
   - Create validation utilities
   - Create migration utilities

2. **Update Dependent Systems**
   - Social: Replace reputation schema
   - Faction: Replace standing schema
   - NSFW: Replace consent fields
   - Chat Lifecycle: Add consent and rating enforcement

3. **Add Runtime Enforcement**
   - Generation boundary checks
   - Content filtering
   - Audit logging

4. **Testing & Validation**
   - Schema validation tests
   - Integration tests
   - Migration tests

### Technical Considerations

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

## Related Epics

- **Epic Character Core** — NSFW content rating, relationships
- **Epic Chat Lifecycle** — NSFW toggle, moderation
- **Epic Social Interaction** — Reputation model
- **Epic Faction Reputation** — Faction standing
- **Epic NSFW** — Consent, reputation, content rating
- **Epic Economy** — Reputation for pricing
- **Epic Battle** — Reputation for NPC behavior
- **Epic Analytics** — Consent and rating events
- **Epic Plugin System** — Schema contracts

## Linked Tasks

- `TASK-shared-schemas.md`
- `TASK-reputation-schema.md`
- `TASK-consent-schema.md`
- `TASK-nsfw-rating-schema.md`
- `TASK-schema-migration.md`
- `TASK-schema-validation.md`

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

## Implementation Phases

### Phase 1: Schema Definition (High Priority)

- Define ReputationScore schema
- Define ConsentState schema
- Define NSFWContentRating enforcement

### Phase 2: Integration (Medium Priority)

- Social schema migration
- Faction schema migration
- NSFW schema migration
- Chat Lifecycle integration

### Phase 3: Runtime Enforcement (High Priority)

- Generation boundary checks
- Content filtering
- Audit logging

### Phase 4: Testing & Validation (Medium Priority)

- Schema validation tests
- Integration tests
- Migration tests

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

## Related Resources

- [Character Core System](docs/spec/character-core.md)
- [Chat Lifecycle & Moderation](docs/spec/chat-lifecycle.md)
- [Social Interaction Design](docs/spec/social.md)
- [Faction Reputation](docs/spec/faction.md)
- [NSFW System Design](docs/spec/nsfw-design.md)
- [Economy System](docs/spec/economy.md)
- [Battle System](docs/spec/battle-design.md)
- [Plugin System](docs/spec/plugin-system.md)
