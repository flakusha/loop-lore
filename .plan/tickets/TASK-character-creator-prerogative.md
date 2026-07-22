# TASK: Character Creator Prerogative & Availability

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** High
**Effort:** Medium
**Status:** In Progress (schema done, needs routes)

## Summary

Implement character availability controls (private, public, activity restrictions) and attribution licensing system (CC, proprietary, opt-in).

## Character Availability

Creator controls who can use their character and how.

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
  public_chats: boolean; // Can appear in public chats
  private_chats: boolean; // Can appear in private chats
  group_chats: boolean; // Can appear in group chats
  solo_chats: boolean; // Can be used in solo mode

  // NSFW restrictions
  nsfw_allowed: boolean; // Can participate in NSFW content
  nsfw_categories: string[]; // Allowed NSFW categories
  nsfw_hard_limits: string[]; // Never allowed
}

type ActivityType =
  | "chat" // Basic conversation
  | "roleplay" // Roleplay scenarios
  | "nsfw" // Adult content
  | "combat" // Battle/combat
  | "trading" // Trade/economy
  | "questing" // Quest participation
  | "group_activity" // Group events
  | "world_event" // World-level events
  | "export" // Can be exported
  | "remix" // Can be modified by others
  | "commercial"; // Commercial use

interface ActivityRestriction {
  activity: ActivityType;
  restriction: "blocked" | "allowed" | "ask_creator" | "friends_only";
  reason?: string;
}

interface ShareSettings {
  can_be_shared: boolean;
  share_requires_approval: boolean;
  max_copies: number | null; // null = unlimited
  share_with_credit: boolean; // Must credit original creator
}
```

### Database Schema

```sql
CREATE TABLE character_availability (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id) UNIQUE,
  visibility TEXT NOT NULL DEFAULT 'private',
  usage_policy JSON NOT NULL DEFAULT '{}',
  activity_restrictions JSON NOT NULL DEFAULT '[]',
  share_settings JSON NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE character_access_grants (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id),
  user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  permissions JSON NOT NULL,    -- What they can do
  expires_at DATETIME,          -- Optional expiry
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_id, user_id)
);

-- Filter for character selection screen
CREATE INDEX idx_character_availability_visibility ON character_availability(visibility);
CREATE INDEX idx_character_availability_creator ON character_availability(character_id);
```

### Character Screen Filters

Add to character selection/browse screen:

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

  // Availability filters
  available_for?: "my_private" | "my_public" | "group" | "all";

  // Sort
  sort_by?: "name" | "created" | "popularity" | "rating";
  sort_order?: "asc" | "desc";
}
```

## Attribution Licensing

Creator controls how their character can be used by others.

### License Types

```typescript
interface CharacterLicensing {
  character_id: string;

  // License type
  license: LicenseType;

  // Attribution requirements
  attribution: AttributionSettings;

  // Derivative works
  derivatives: DerivativeSettings;

  // Commercial use
  commercial: CommercialSettings;
}

type LicenseType =
  | "all_rights" // Default — no sharing
  | "cc_by" // Creative Commons Attribution
  | "cc_by_sa" // CC Attribution-ShareAlike
  | "cc_by_nc" // CC Attribution-NonCommercial
  | "cc_by_nc_sa" // CC Attribution-NonCommercial-ShareAlike
  | "cc_by_nd" // CC Attribution-NoDerivs
  | "cc_by_nc_nd" // CC Attribution-NonCommercial-NoDerivs
  | "cc0" // Public domain
  | "custom"; // Custom license terms

interface AttributionSettings {
  require_attribution: boolean; // Must credit creator
  attribution_text?: string; // Custom attribution text
  attribution_url?: string; // Link to creator profile
  show_in_character_card: boolean; // Show attribution in card
}

interface DerivativeSettings {
  allow_derivatives: boolean; // Can others create variants
  share_alike: boolean; // Derivatives must use same license
  require_approval: boolean; // Creator must approve derivatives
  max_derivative_depth: number; // How many generations of derivatives
}

interface CommercialSettings {
  allow_commercial: boolean; // Can be used commercially
  royalty_percentage: number; // Creator's royalty (0-100)
  commercial_approval: boolean; // Creator must approve commercial use
}
```

### Database Schema

```sql
CREATE TABLE character_licensing (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES character_core(id) UNIQUE,
  license TEXT NOT NULL DEFAULT 'all_rights',
  attribution JSON NOT NULL DEFAULT '{}',
  derivatives JSON NOT NULL DEFAULT '{}',
  commercial JSON NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Track character lineage (derivatives)
CREATE TABLE character_derivatives (
  id TEXT PRIMARY KEY,
  original_id TEXT NOT NULL REFERENCES character_core(id),
  derivative_id TEXT NOT NULL REFERENCES character_core(id),
  license_at_creation TEXT NOT NULL,  -- License when derivative was created
  approved_by_creator BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(original_id, derivative_id)
);
```

## Tasks

- [ ] Design availability system architecture
- [ ] Design licensing system architecture
- [ ] Implement Character Availability CRUD
- [ ] Implement Usage Policy
- [ ] Implement Activity Restrictions
- [ ] Implement Share Settings
- [ ] Implement Access Grants (per-user permissions)
- [ ] Implement Character Screen Filters
- [ ] Implement License Types
- [ ] Implement Attribution Settings
- [ ] Implement Derivative Works tracking
- [ ] Implement Commercial Settings
- [ ] Implement Character Lineage tracking
- [ ] Write tests for availability system
- [ ] Write tests for licensing system

## Files

- `src/characters/availability.ts` — availability system
- `src/characters/licensing.ts` — licensing system
- `src/characters/access-grants.ts` — per-user permissions
- `src/characters/filters.ts` — character screen filters
- `src/characters/derivatives.ts` — derivative tracking
- `src/characters/types.ts` — type definitions
