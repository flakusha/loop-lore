# TASK: Context-Based Feature Permissions (UI Gating)

**Epic:** EPIC-2026-36
**Priority:** Medium
**Effort:** Medium
**Status:** ✅ Done
**Source:** `.tmp/loop-lore-ideas.md` — Text input: availability of functionality based on chat/world/location permissions

## Summary

UI feature availability is gated based on the current context (chat, world,
location). Buttons, commands, and modal actions are enabled/disabled or hidden
based on what the user is allowed to do in the current context. This is
distinct from plugin permissions (Epic 37) — it is about UI-level feature gating
based on context, not plugin capabilities.

## Rationale

- Users should only see actions they can perform in the current context
- World/location configs may restrict certain features (e.g., no trading in safe zones)
- Chat type affects available actions (group chat vs. solo vs. public)
- Reduces UI clutter and prevents invalid operations

## Design

### Context Permission Model

```typescript
interface ContextPermissions {
  context_id: string; // chat_id, world_id, or location_id
  context_type: "chat" | "world" | "location" | "global";
  features: FeaturePermission[];
}

interface FeaturePermission {
  feature_id: string; // "send_image", "use_command", "create_poll", etc.
  allowed: boolean;
  reason?: string; // "Location is a safe zone", "Chat is read-only"
  conditions?: PermissionCondition[]; // Dynamic conditions
}

interface PermissionCondition {
  type: "user_role" | "character_presence" | "time_of_day" | "world_state" | "custom";
  operator: "eq" | "ne" | "gt" | "lt" | "in" | "not_in";
  value: unknown;
  description: string;
}
```

### Feature Registry

| Feature ID         | Description            | Default              |
| ------------------ | ---------------------- | -------------------- |
| `send_text`        | Send text messages     | Always allowed       |
| `send_image`       | Attach images          | Chat/world dependent |
| `send_audio`       | Attach audio           | Chat/world dependent |
| `use_commands`     | Slash commands         | Chat/world dependent |
| `create_poll`      | Create polls           | Group chat only      |
| `transfer_chat`    | Transfer chat location | World-dependent      |
| `summon_character` | Summon characters      | World-dependent      |
| `open_inventory`   | Open inventory         | RPG mode only        |
| `battle_mode`      | Enter battle mode      | Location-dependent   |
| `export_chat`      | Export chat            | Owner/admin only     |

### UI Gating Implementation

```typescript
interface UIFeatureGate {
  feature_id: string;
  element_selector: string; // CSS selector for the UI element
  gate_type: "hide" | "disable" | "tooltip"; // How to gate
  fallback_tooltip: string; // Shown when disabled
}

// Example: Hide image button in read-only chats
const featureGates: UIFeatureGate[] = [
  {
    feature_id: "send_image",
    element_selector: "#btn-attach-image",
    gate_type: "hide",
    fallback_tooltip: "Image attachments not allowed in this context",
  },

  {
    feature_id: "use_commands",
    element_selector: "#input-commands",
    gate_type: "disable",
    fallback_tooltip: "Commands disabled in this chat",
  },
];
```

### Permission Resolution

```typescript
function resolveFeaturePermission(
  feature_id: string,
  context: Context,
  user: User,
): FeaturePermission {
  // 1. Check global permissions (from user role)
  const global = getGlobalPermission(feature_id, user.role,);

  // 2. Check world permissions (from world config)
  const world = getWorldPermission(feature_id, context.world_id,);

  // 3. Check chat permissions (from chat config)
  const chat = getChatPermission(feature_id, context.chat_id,);

  // 4. Check location permissions (from location config)
  const location = getLocationPermission(feature_id, context.location_id,);

  // 5. Evaluate dynamic conditions
  const conditionsMet = evaluateConditions(feature_id, context, user,);

  // Merge: most restrictive wins
  return mergePermissions(global, world, chat, location, conditionsMet,);
}
```

## Integration Points

- **Chat Lifecycle** (Epic 36): Chat-level feature restrictions
- **World & Locations** (Epic 38/44): World/location-based restrictions
- **Plugin System** (Epic 37): Plugin-provided features need gating
- **Character Creator** (TASK-character-creator-prerogative.md): Character usage restrictions
- **Frontend** (docs/frontend/chat/input.md): Input area feature gating

## Tasks

- [ ] Design feature permission model + registry
- [ ] Implement permission storage (per context type)
- [ ] Implement permission resolution (merge + conditions)
- [ ] Implement UI feature gating (hide/disable/tooltip)
- [ ] Add feature permission editor in world/chat settings
- [ ] Wire into frontend input component
- [ ] Add permission checks to command parser
- [ ] Write tests for permission resolution

## Risk

Medium — permission resolution across nested contexts (global → world → chat → location)
can produce conflicting rules. Need clear precedence and a debug/tracing tool for
operators to understand why a feature is hidden/disabled.

## Files

- `src/chat/feature-permissions.ts` — permission logic
- `src/db/schema-permissions.ts` — permission tables
- `src/frontend/alpine/feature-gate.ts` — UI gating
- `src/frontend/components/feature-permission-editor.html` — settings UI

## Related

- TASK-character-creator-prerogative.md — Character usage restrictions (similar pattern)
- Epic 36 (Chat Lifecycle & Moderation) — Chat-level restrictions
- Epic 37 (Plugin System & Extensibility) — Plugin feature permissions
- Epic 38/44 (World & Locations) — World/location restrictions
- docs/frontend/chat/input.md — Input area specification

## Completion Note

Deferred — feature registry and UI gating not yet started
