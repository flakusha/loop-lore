# TASK: Character Creator Prerogative & Availability

**Epic:** Character Core System
**Priority:** High
**Effort:** Medium
**Status:** Not Started

## Summary

Character availability controls (private, public, activity restrictions) and attribution licensing system with two modes: creator-controlled (CC licenses) OR full public domain (CC0). Admin management for disputes and policy enforcement.

## Design

### Availability Settings

```typescript
interface CharacterAvailability {
  character_id: string;

  // Visibility
  visibility: "private" | "unlisted" | "public";

  // Usage restrictions
  usage_policy: UsagePolicy;

  // Activity restrictions
  activity_restrictions: ActivityRestriction[];

  // Sharing
  share_settings: ShareSettings;
}

interface UsagePolicy {
  // Who can use this character
  allowed_users: "all" | "friends_only" | "specific_users" | "nobody";
  specific_user_ids?: string[];

  // How it can be used
  allowed_activities: ActivityType[]; // If empty, all allowed
  banned_activities: ActivityType[]; // Explicit bans

  // Context restrictions
  public_chats: boolean;
  private_chats: boolean;
  group_chats: boolean;
  solo_chats: boolean;

  // NSFW restrictions
  nsfw_allowed: boolean;
  nsfw_categories: string[];
  nsfw_hard_limits: string[];
}

type ActivityType =
  | "chat"
  | "roleplay"
  | "nsfw"
  | "combat"
  | "trading"
  | "questing"
  | "group_activity"
  | "world_event"
  | "export"
  | "remix"
  | "commercial";

interface ActivityRestriction {
  activity: ActivityType;
  restriction: "blocked" | "allowed" | "ask_creator" | "friends_only";
  reason?: string;
}

interface ShareSettings {
  can_be_shared: boolean;
  share_requires_approval: boolean;
  max_copies: number | null; // null = unlimited
  share_with_credit: boolean;
}
```

### Licensing System

Two modes: creator-controlled OR full public domain.

#### Mode 1: Creator-Controlled

Creator chooses license from CC options or custom terms:

```typescript
type CreatorLicense =
  | "all_rights" // Default — no sharing
  | "cc_by" // Creative Commons Attribution
  | "cc_by_sa" // CC Attribution-ShareAlike
  | "cc_by_nc" // CC Attribution-NonCommercial
  | "cc_by_nc_sa" // CC Attribution-NonCommercial-ShareAlike
  | "cc_by_nd" // CC Attribution-NoDerivs
  | "cc_by_nc_nd" // CC Attribution-NonCommercial-NoDerivs
  | "custom"; // Custom license terms
```

#### Mode 2: Full Public Domain

No restrictions, no attribution required:

```typescript
type PublicDomainLicense =
  | "cc0" // Creative Commons Zero — public domain
  | "public_domain"; // Explicit public domain declaration
```

**Public Domain characteristics:**

- No attribution required
- No restrictions on use
- No restrictions on modification
- No restrictions on commercial use
- No restrictions on distribution
- Creator waives all rights

#### License Selection

```typescript
interface LicenseSelection {
  character_id: string;

  // License mode
  mode: "creator_controlled" | "public_domain";

  // Creator-controlled options
  creator_license?: CreatorLicense;
  custom_license_text?: string;

  // Public domain options
  public_domain_license?: PublicDomainLicense;

  // Attribution (required for CC, optional for public domain)
  attribution: AttributionSettings;

  // Derivative works
  derivatives: DerivativeSettings;

  // Commercial use
  commercial: CommercialSettings;
}

interface AttributionSettings {
  require_attribution: boolean; // Must credit creator
  attribution_text?: string; // Custom attribution text
  attribution_url?: string; // Link to creator profile
  show_in_character_card: boolean;
}

interface DerivativeSettings {
  allow_derivatives: boolean;
  share_alike: boolean; // Derivatives must use same license
  require_approval: boolean;
  max_derivative_depth: number;
}

interface CommercialSettings {
  allow_commercial: boolean;
  royalty_percentage: number; // 0-100
  commercial_approval: boolean;
}
```

### Admin Management

Admins can manage characters for policy enforcement:

```typescript
interface AdminCharacterManagement {
  admin_id: string;
  character_id: string;

  // Actions
  action:
    | "visibility_override" // Force private/public
    | "license_override" // Change license
    | "ban" // Ban character
    | "approve" // Approve character
    | "restrict" // Add restrictions
    | "warn" // Warn creator
    | "remove"; // Remove character;

  // Details
  reason: string;
  timestamp: Date;
  expires_at?: Date; // Temporary restrictions
  notify_creator: boolean;
  appeal_allowed: boolean;
}

interface AdminPolicyOverride {
  // System-wide policies
  content_policy: ContentPolicy;
  age_requirement: number;
  nsfw_policy: NsfwPolicy;
  licensing_policy: LicensingPolicy;
}

interface ContentPolicy {
  allowed_content: string[];
  banned_content: string[];
  review_required: boolean;
  auto_moderation: boolean;
}

interface NsfwPolicy {
  require_age_verification: boolean;
  allowed_nsfw_levels: string[];
  nsfw_in_public: boolean;
  nsfw_marking_required: boolean;
}

interface LicensingPolicy {
  allowed_licenses: string[];
  require_attribution: boolean;
  default_license: string;
}
```

### Character Screen Filters

```typescript
interface CharacterFilter {
  // Basic filters
  visibility?: "private" | "unlisted" | "public";
  creator_id?: string;
  species?: string;

  // Activity filters
  allows_chat?: boolean;
  allows_roleplay?: boolean;
  allows_nsfw?: boolean;
  allows_combat?: boolean;
  allows_group?: boolean;

  // NSFW filters
  nsfw_level?: "none" | "mild" | "moderate" | "intense" | "extreme";

  // License filters
  license_type?: string;
  allows_derivatives?: boolean;
  allows_commercial?: boolean;

  // Availability filters
  available_for?: "my_private" | "my_public" | "group" | "all";

  // Sort
  sort_by?: "name" | "created" | "popularity" | "rating";
  sort_order?: "asc" | "desc";
}
```

## Integration Points

### With Character Core

Availability is part of character metadata:

```typescript
interface CharacterCore {
  // ... other fields ...
  availability: CharacterAvailability;
  licensing: LicenseSelection;
}
```

### With Import/Export

License information is preserved during import/export:

```typescript
// Import preserves license
const imported = importCharacter(file,);
// imported.licensing = original license (or default if none)

// Export includes license
const exported = exportCharacter(character, "png",);
// exported includes license metadata in card
```

### With Chat Generation

Availability affects who can use the character:

```typescript
// Check availability before allowing character in chat
const canUse = checkAvailability(characterId, userId, chatType,);
// Returns: { allowed: boolean, reason?: string }
```

### With Admin Panel

Admins can manage characters:

```typescript
// Admin overrides
const adminAction = {
  action: "visibility_override",
  character_id: "char_123",
  reason: "Violates content policy",
  admin_id: "admin_456",
  expires_at: null, // Permanent
};
```

## Tasks

### Phase 1: Schema & Core (Week 1)

- [ ] Create `character_availability` table
- [ ] Create `character_licensing` table
- [ ] Create `admin_character_overrides` table
- [ ] Implement availability CRUD
- [ ] Implement licensing CRUD
- [ ] Add license validation

### Phase 2: Admin Management (Week 2)

- [ ] Implement admin override system
- [ ] Add content policy enforcement
- [ ] Add NSFW policy enforcement
- [ ] Add licensing policy enforcement
- [ ] Add admin notification system

### Phase 3: Integration (Week 3)

- [ ] Integrate with character CRUD
- [ ] Integrate with import/export
- [ ] Integrate with chat generation
- [ ] Add character screen filters
- [ ] Add availability checks

### Phase 4: UI & Testing (Week 4)

- [ ] Add availability editor in character UI
- [ ] Add license selector UI
- [ ] Add admin management UI
- [ ] Write unit tests for availability
- [ ] Write unit tests for licensing
- [ ] Write integration tests with admin system

## Files to Create

- `src/characters/availability.ts` — Availability CRUD
- `src/characters/licensing.ts` — Licensing CRUD
- `src/characters/admin-management.ts` — Admin overrides
- `src/characters/filters.ts` — Character screen filters
- `src/db/schema-availability.ts` — Availability tables
- `src/routes/character-availability.ts` — API endpoints
- `src/components/availability-editor.html` — UI component
- `src/components/license-selector.html` — License UI

## Files to Modify

- `src/db/schema-core.ts` — Availability column types
- `src/db/migrations/` — New tables
- `src/characters/core.ts` — Availability integration
- `src/characters/parser.ts` — License import/export
- `src/routes/characters.ts` — Availability checks
- `src/views/character-editor.html` — Availability UI
- `src/admin/` — Admin management

## Risk

Medium — licensing complexity, admin override ethics, content policy enforcement. Need clear documentation and appeal process.

## Related

- TASK-character-world-data-separation.md — Character core
- TASK-character-personality-integrity.md — Personality is immutable
- epic-character-core-system.md — Parent epic
- epic-import-export-io.md — Import/export integration
