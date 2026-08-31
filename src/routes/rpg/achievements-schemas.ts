// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Achievements route schemas.
 *
 * TypeBox body/query schemas for the achievements CRUD + player-progress
 * routes (`achievements.ts`). Extracted to keep the route module under the
 * 250L ceiling.
 */

import { t, } from "elysia";
import { AchievementCategory, AchievementTier, } from "../../rpg/achievements";

const unlockConditionSchema = t.Object({
  type: t.Union([
    t.Literal("simple",),
    t.Literal("compound",),
    t.Literal("counter",),
    t.Literal("streak",),
  ],),
  target: t.Optional(t.String(),),
  count: t.Optional(t.Number(),),
  conditions: t.Optional(t.Array(t.Any(),),),
  operator: t.Optional(t.Union([t.Literal("and",), t.Literal("or",),],),),
},);

const rewardSchema = t.Object({
  type: t.Union([
    t.Literal("experience",),
    t.Literal("item",),
    t.Literal("currency",),
    t.Literal("title",),
    t.Literal("cosmetic",),
    t.Literal("unlock",),
  ],),
  value: t.Any(),
  description: t.String(),
},);

export const achievementBody = t.Object({
  name: t.String({ minLength: 1, },),
  description: t.String(),
  category: t.Enum(AchievementCategory,),
  tier: t.Enum(AchievementTier,),
  icon: t.Optional(t.String(),),
  isSecret: t.Optional(t.Boolean(),),
  isHidden: t.Optional(t.Boolean(),),
  unlockCondition: unlockConditionSchema,
  rewards: t.Optional(t.Array(rewardSchema,),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const updateAchievementBody = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, },),
    description: t.String(),
    category: t.Enum(AchievementCategory,),
    tier: t.Enum(AchievementTier,),
    icon: t.Union([t.String(), t.Null(),],),
    isSecret: t.Boolean(),
    isHidden: t.Boolean(),
    unlockCondition: unlockConditionSchema,
    rewards: t.Array(rewardSchema,),
    metadata: t.Record(t.String(), t.Any(),),
  },),
);

export const listAchievementsQuery = t.Object({
  category: t.Optional(t.Enum(AchievementCategory,),),
  includeSecret: t.Optional(t.Boolean(),),
},);

export const progressBody = t.Object({
  progressIncrement: t.Optional(t.Number(),),
},);
