# Epic: Achievements

**Status:** 🟡 Code+tests+schema done (migration 035); UNWIRED — routes pending
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** achievements, trophies, badges, milestones, rewards

## Summary

Achievement and trophy system — track player accomplishments, milestones, and special feats. Covers achievement categories, unlock conditions, rewards, and display mechanics.

## Reference

- Spec: `docs/spec/achievements.md` (STUB — needs expansion)

## Design

### Core Achievement Model

```typescript
interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  icon_asset_id: string | null;
  hidden: boolean; // secret achievements
  criteria: UnlockCondition[];
  rewards: AchievementReward[];
  created_at: string;
}

interface AchievementCategory {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

interface AchievementTier {
  id: string;
  name: string; // "bronze", "silver", "gold", "platinum"
  color: string;
  sort_order: number;
}

interface AchievementProgress {
  achievement_id: string;
  player_id: string;
  current_value: number;
  target_value: number;
  unlocked_at: string | null;
}

interface AchievementReward {
  achievement_id: string;
  reward_type: "cosmetic" | "title" | "bonus" | "currency";
  reward_data: string; // JSON
}
```

### Unlock Conditions

```typescript
interface UnlockCondition {
  type: ConditionType;
  target: string; // entity ID or metric name
  value: number; // threshold
  operator: "gte" | "lte" | "eq";
}

type ConditionType =
  | "kill_count"
  | "item_collect"
  | "location_visit"
  | "quest_complete"
  | "dialogue_choice"
  | "craft_item"
  | "trade_complete"
  | "days_played"
  | "custom_metric";

interface CompoundCondition {
  logic: "and" | "or";
  conditions: UnlockCondition[];
}

interface SecretAchievement {
  achievement_id: string;
  reveal_condition: string; // when to show the achievement exists
}
```

### Display & Social

```typescript
interface AchievementDisplay {
  player_id: string;
  achievement_id: string;
  displayed: boolean;
  display_order: number;
}

interface TrophyCase {
  player_id: string;
  featured: string[]; // achievement IDs shown on profile
}

interface AchievementNotification {
  id: string;
  player_id: string;
  achievement_id: string;
  read: boolean;
  created_at: string;
}

interface SocialSharing {
  player_id: string;
  achievement_id: string;
  platform: string;
  shared_at: string;
}
```

## Key Behaviors

- Achievements unlock based on player actions, milestones, and world events
- Multiple tiers (bronze, silver, gold, platinum) for progression
- Secret achievements add mystery and replay value
- Achievement rewards grant cosmetic items, titles, or bonuses
- Social features allow sharing and comparison
- Achievement progress tracks partial completion

## Tasks

- [x] Achievement data model (schema + migration)
- [x] Achievement CRUD API routes
- [ ] Unlock condition evaluation engine
- [x] Progress tracking system
- [x] Reward grant pipeline
- [ ] Achievement notification system
- [ ] Trophy case / display UI
- [ ] Secret achievement reveal logic
- [ ] Social sharing integration
- [ ] Achievement admin panel

## Files

- `src/db/schema-achievements.ts` — achievement tables (TBD)
- `src/routes/achievements.ts` — API routes (TBD)
- `src/achievements/` — unlock engine (TBD)
- `src/frontend/achievements.html` — display component (TBD)

## Acceptance Criteria

- [ ] Achievement model with categories and tiers
- [ ] Unlock conditions evaluate correctly
- [ ] Progress tracks partial completion
- [ ] Rewards grant on unlock
- [ ] Secret achievements hidden until revealed
- [ ] Notifications fire on unlock
- [ ] Tests passing

## Related Epics

- `epic-character-core-system.md` — character stats for stat-based achievements
- `epic-items.md` — item collection achievements, reward items
- `epic-quests-encounters.md` — quest completion achievements
- `epic-rpg-mechanics.md` — combat/leveling achievements
- `epic-actors.md` — player entity for achievement ownership

## Tickets

- `TASK-achievements.md` — implementation tasks
- `TASK-wire-achievements-routes.md` — wire AchievementsService under `/api/rpg/achievements`

## Wiring & Resolution Plan (2026-08-08 audit)

`AchievementsService` (src/rpg/achievements/, CRUD + progress, backed by `achievements` +
`player_achievements`, migration 035) is code-complete + tested but has ZERO external importers.
Resolution: mount it under `/api/rpg/achievements` (CRUD + progress/claim) via the WIRED-7
mount pattern — tracked by `TASK-wire-achievements-routes`. Display/trophy-case remains separate
frontend work tracked by FEAT-achievements.
