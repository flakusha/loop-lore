# TASK: User Seeding & Role Expansion

**Epic:** Logic Reconciliation
**Priority:** High
**Effort:** Medium
**Status:** ⬜ Not Started — design doc exists (roles, config schema, DB schema, task list); implementation pending. Code reality: `UserRole` = admin/user/viewer/solo (`src/db/enums-core/users.ts`), seeding = `seedDefaultActors` + bootstrap admin (`src/db/seed.ts`), no config-driven seeding, no `user_roles`/`seed_audit` tables

## Summary

Expand user seeding beyond assistant/admin/solo to support configurable additional roles for fast retesting. Add config field for seeding users with custom roles and test data.

## Current State

Currently only 3 user roles:

- **Admin** — full access
- **Assistant** — LLM assistant
- **Solo** — single-user mode (optional, for fast retesting)

## Requirements

### Additional User Roles

```typescript
type UserRole =
  | "admin" // Full system access
  | "moderator" // Content moderation, user management
  | "assistant" // LLM assistant
  | "creator" // Character/world creation
  | "player" // Standard player
  | "viewer" // Read-only access
  | "solo" // Solo mode (fast retesting)
  | "guest" // Limited access, no persistence
  | "bot" // Automated/bot user
  | "tester" // QA/testing role
  | "custom"; // Custom role with specific permissions
```

### Seeding Configuration

```yaml
# config.yaml
seeding:
  enabled: true

  # Default users to seed
  users:
    - username: admin
      password: ${ADMIN_PASSWORD} # From env
      role: admin
      seed_data: true

    - username: moderator
      password: ${MOD_PASSWORD}
      role: moderator
      seed_data: true

    - username: creator
      password: ${CREATOR_PASSWORD}
      role: creator
      seed_data: true

    - username: player1
      password: ${PLAYER1_PASSWORD}
      role: player
      seed_data: true

    - username: player2
      password: ${PLAYER2_PASSWORD}
      role: player
      seed_data: true

    - username: tester
      password: ${TESTER_PASSWORD}
      role: tester
      seed_data: true

    - username: guest
      password: ${GUEST_PASSWORD}
      role: guest
      seed_data: false

  # Seed data templates
  seed_data:
    characters:
      - name: "Test Character"
        species: "human"
        visibility: "public"
        role: "player"

    worlds:
      - name: "Test World"
        visibility: "public"
        creator: "creator"

    chats:
      - participants: ["player1", "player2"]
        type: "private"

  # Environment-specific overrides
  environments:
    development:
      users:
        - username: dev_admin
          role: admin
          seed_data: true

    testing:
      users:
        - username: test_user
          role: player
          seed_data: true

    staging:
      users:
        - username: staging_admin
          role: admin
          seed_data: true
```

### Config Schema

```typescript
interface SeedingConfig {
  enabled: boolean;
  users: SeedUser[];
  seed_data: SeedData;
  environments: Record<string, EnvironmentOverride>;
}

interface SeedUser {
  username: string;
  password: string; // Can reference env vars
  role: UserRole;
  seed_data: boolean;
  metadata?: Record<string, unknown>;
}

interface SeedData {
  characters?: SeedCharacter[];
  worlds?: SeedWorld[];
  chats?: SeedChat[];
  items?: SeedItem[];
  quests?: SeedQuest[];
}

interface SeedCharacter {
  name: string;
  species: string;
  visibility: "private" | "public";
  role: string; // Which user role this is for
  personality?: PersonalityTrait[];
  stats?: CharacterStats;
}

interface SeedWorld {
  name: string;
  visibility: "private" | "public";
  creator: string; // Username of creator
  locations?: SeedLocation[];
  npcs?: SeedNPC[];
}

interface SeedChat {
  participants: string[]; // Usernames
  type: "private" | "group" | "public";
  initial_messages?: string[];
}

interface EnvironmentOverride {
  users?: SeedUser[];
  seed_data?: Partial<SeedData>;
}
```

### Database Schema

```sql
-- Extended user roles
CREATE TABLE user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  permissions JSON NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, role)
);

-- Seeding audit trail
CREATE TABLE seed_audit (
  id TEXT PRIMARY KEY,
  seed_type TEXT NOT NULL,  -- 'user', 'character', 'world', etc.
  seed_id TEXT NOT NULL,    -- ID of seeded entity
  seeded_by TEXT NOT NULL,  -- 'system', 'admin', username
  seeded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  environment TEXT NOT NULL DEFAULT 'development',
  metadata JSON
);

-- Role permissions
CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  resource TEXT,  -- Specific resource or null for all
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, permission, resource)
);
```

### Permission Matrix

```typescript
interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
}

type Permission =
  | "chat.create"
  | "chat.join"
  | "chat.delete"
  | "character.create"
  | "character.edit_own"
  | "character.edit_any"
  | "character.delete_own"
  | "character.delete_any"
  | "world.create"
  | "world.edit_own"
  | "world.edit_any"
  | "world.delete_own"
  | "world.delete_any"
  | "user.view"
  | "user.edit"
  | "user.delete"
  | "user.ban"
  | "moderation.review"
  | "moderation.action"
  | "admin.settings"
  | "admin.users"
  | "admin.system"
  | "export.own"
  | "export.any"
  | "import.own"
  | "import.any";

// Default permission sets
const DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ["*",], // All permissions
  moderator: ["chat.*", "character.view", "moderation.*", "user.view", "user.ban",],
  assistant: ["chat.join", "character.view",],
  creator: ["character.*", "world.*", "export.own", "import.own",],
  player: [
    "chat.create",
    "chat.join",
    "character.create",
    "character.edit_own",
    "world.create",
    "world.edit_own",
    "export.own",
  ],
  viewer: ["chat.join", "character.view", "world.view",],
  solo: ["*",], // Full access in solo mode
  guest: ["chat.join", "character.view",],
  bot: ["chat.join", "chat.create",],
  tester: ["*",], // Full access for testing
  custom: [], // Custom set
};
```

## Tasks

- [ ] Design role expansion architecture
- [ ] Design seeding configuration schema
- [ ] Implement additional user roles
- [ ] Implement permission matrix
- [ ] Implement role-based access control
- [ ] Implement seeding configuration
- [ ] Implement user seeding
- [ ] Implement character seeding
- [ ] Implement world seeding
- [ ] Implement chat seeding
- [ ] Implement environment-specific overrides
- [ ] Implement seed audit trail
- [ ] Write tests for role system
- [ ] Write tests for seeding system
- [ ] Update documentation

## Files

- `src/config/seeding.ts` — seeding configuration
- `src/users/roles.ts` — role management
- `src/users/permissions.ts` — permission system
- `src/seeding/users.ts` — user seeding
- `src/seeding/characters.ts` — character seeding
- `src/seeding/worlds.ts` — world seeding
- `src/seeding/audit.ts` — seed audit trail
- `config/seeding.yaml` — default seeding config
