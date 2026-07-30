# TASK: Shared Schemas — Reputation, Consent, NSFW Content Rating

**Status:** ✅ Complete
**Priority:** High
**Effort:** Medium
**Epic:** epic-character-core-system

## Summary

Three shared schemas are needed across multiple epics but lack a unified definition:

1. `ReputationScore` — Social, Faction, and NSFW all define reputation differently
2. `ConsentState` — NSFW consent mechanics need integration with Chat Lifecycle moderation
3. `NSFWContentRating` — Character Core defines 5-tier rating but no runtime enforcement contract

## Linked Epics

- `epic-character-core-system.md` (NSFW rating, relationships)
- `epic-social-interaction.md` (reputation)
- `epic-faction-reputation.md` (reputation)
- `epic-nsfw-game-mechanics.md` (consent, reputation changes)
- `epic-chat-lifecycle-moderation.md` (NSFW toggle, moderation)
- `epic-data-integrity-acid.md` (schema validation)

## Acceptance Criteria

### 1. Unified ReputationScore Schema

- [ ] Single `ReputationScore` interface used by Social, Faction, and NSFW
- [ ] Range: -100 to +100 (hostile to devoted)
- [ ] Tier mapping: Hostile (-100 to -51), Unfriendly (-50 to -21), Neutral (-20 to +20), Friendly (+21 to +50), Allied (+51 to +75), Devoted (+76 to +100)
- [ ] Source tracking (which system modified the score)
- [ ] Decay/refresh mechanics defined
- [ ] Social epic updated to use shared schema
- [ ] Faction epic updated to use shared schema
- [ ] NSFW epic updated to use shared schema

### 2. Unified ConsentState Schema

- [ ] `ConsentState` interface with `consent_required`, `consent_given`, `consent_aware` fields
- [ ] Integration with Chat Lifecycle NSFW toggle (per-chat/user/world)
- [ ] Integration with NSFW encounter mechanics (aphrodisiacs, intimacy actions)
- [ ] Audit trail for consent decisions
- [ ] Revocation mechanism
- [ ] Emergency override (admin/moderation)

### 3. NSFWContentRating Enforcement Contract

- [ ] 5-tier rating enum: `sfw`, `nsfw_mild`, `nsfw_moderate`, `nsfw_intense`, `nsfw_extreme`
- [ ] Runtime enforcement at generation boundary (LLM requests)
- [ ] Content filtering based on rating
- [ ] User preference override (with warnings)
- [ ] Admin override capability
- [ ] Integration with Chat Lifecycle NSFW toggle
- [ ] Integration with Character Core character data model

## Shared Schemas

```typescript
// Unified Reputation Score
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
}

// Unified Consent State
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
}

// NSFW Content Rating
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
}
```

## Integration Points

### Systems This Epic Depends On

| System         | What It Provides                     | How Used                           |
| -------------- | ------------------------------------ | ---------------------------------- |
| Character Core | Character NSFW rating, relationships | Content rating enforcement         |
| Chat Lifecycle | NSFW toggle, moderation              | Consent enforcement, rating gating |
| Social         | Reputation model                     | Unified reputation schema          |
| Faction        | Reputation model                     | Unified reputation schema          |

### Systems That Depend On This Epic

| System  | What It Consumes            | How Used                                |
| ------- | --------------------------- | --------------------------------------- |
| NSFW    | Consent, reputation, rating | Encounter mechanics, seduction checks   |
| Economy | Reputation for pricing      | Merchant discounts, black market access |
| Battle  | Reputation for NPC behavior | Enemy surrender, ally coordination      |

### Cross-System Events

| Event                  | Direction | Purpose                      |
| ---------------------- | --------- | ---------------------------- |
| `consent.given`        | emits     | Enable NSFW encounter        |
| `consent.revoked`      | emits     | Disable NSFW encounter       |
| `reputation.changed`   | emits     | Update all dependent systems |
| `nsfw.rating.enforced` | emits     | Block/allow generation       |
