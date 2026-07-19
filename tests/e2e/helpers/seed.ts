/**
 * E2E Seed Data
 *
 * Populates a test database with demo users, characters, and chats.
 * All IDs are deterministic for cross-flow reference.
 */

import {
  ActorType,
  AgentType,
  ChatMode,
  ChatType,
  ItemCategory,
  ItemRarity,
  QuestStatus,
  QuestType,
  StackableState,
  UserRole,
  UserStatus,
} from "@/db/enums";

// ── Deterministic IDs ───────────────────────────────────────────

/**
 * E2E Seed Data
 *
 * Populates a test database with demo users, characters, and chats.
 * All IDs are deterministic for cross-flow reference.
 */
// ── Deterministic IDs ───────────────────────────────────────────

import type { DB, } from "@/db/schema";
import type { Kysely, } from "kysely";

/**
 * E2E Seed Data
 *
 * Populates a test database with demo users, characters, and chats.
 * All IDs are deterministic for cross-flow reference.
 */
// ── Deterministic IDs ───────────────────────────────────────────
/**
 * E2E Seed Data
 *
 * Populates a test database with demo users, characters, and chats.
 * All IDs are deterministic for cross-flow reference.
 */
// ── Deterministic IDs ───────────────────────────────────────────

/** Password is "password" — bcrypt cost 4 for speed */
const PASSWORD_HASH = "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG";

/** Admin password "adminpass" — bcrypt cost 4 */
const ADMIN_HASH = "$2b$04$8iIP.O0YTEEoM56xn17NiutFxusLfJ7L/DTHZhA2agrM4gXHLD5Uq";

/** Hex-only IDs matching route regex [a-f0-9-]+ */
const U = "00000000-0000-4000-a000-000000000000";
export const SEED = {
  user: {
    id: `a0000001-0000-4000-a000-${U.slice(24,)}`,
    username: "e2euser",
    password: "password",
  },
  admin: {
    id: `a0000002-0000-4000-a000-${U.slice(24,)}`,
    username: "e2eadmin",
    password: "adminpass",
  },
  character: {
    id: `a0000003-0000-4000-a000-${U.slice(24,)}`,
    name: "E2E Test Character",
  },
  soloCharacter: {
    id: `a0000007-0000-4000-a000-${U.slice(24,)}`,
    name: "E2E Solo Character",
  },
  chat: {
    id: `a0000004-0000-4000-a000-${U.slice(24,)}`,
    name: "E2E Test Chat",
  },
  message: {
    id: `a0000005-0000-4000-a000-${U.slice(24,)}`,
    content: "Hello from E2E test",
  },
  asset: {
    id: `a0000006-0000-4000-a000-${U.slice(24,)}`,
    filename: "test-image.png",
  },
  solo: {
    id: `a0000008-0000-4000-a000-${U.slice(24,)}`,
    username: "demo",
  },
  soloChat: {
    id: `a0000009-0000-4000-a000-${U.slice(24,)}`,
    name: "E2E Test Chat",
  },
  world: {
    id: `a0000010-0000-4000-a000-${U.slice(24,)}`,
    name: "E2E Test World",
    description: "World for E2E testing",
  },
  location: {
    id: `a0000011-0000-4000-a000-${U.slice(24,)}`,
    name: "E2E Test Location",
    description: "A dusty tavern in the starting village",
  },
  item: {
    id: `a0000012-0000-4000-a000-${U.slice(24,)}`,
    name: "Iron Sword",
    description: "A plain but reliable blade",
  },
  quest: {
    id: `a0000013-0000-4000-a000-${U.slice(24,)}`,
    name: "Retrieve the Lost Artifact",
    description: "Find the ancient relic hidden in the caves beneath the village",
  },
} as const;

// ── Seed functions ──────────────────────────────────────────────

export async function seedUsers(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("users",)
    .values([
      {
        id: SEED.user.id,
        username: SEED.user.username,
        display_name: "E2E User",
        password_hash: PASSWORD_HASH,
        role: UserRole.User,
        status: UserStatus.Active,
        settings: "{}",
      },
      {
        id: SEED.admin.id,
        username: SEED.admin.username,
        display_name: "E2E Admin",
        password_hash: ADMIN_HASH,
        role: UserRole.Admin,
        status: UserStatus.Active,
        settings: "{}",
      },
    ],)
    .onConflict((oc,) => oc.column("username",).doNothing())
    .execute();

  // chat_participants.actor_id references actors.id, not users.id
  // Create corresponding actor entries for seeded users
  await db
    .insertInto("actors",)
    .values([
      {
        id: SEED.user.id,
        actor_type: ActorType.User,
        display_name: "E2E User",
        user_id: SEED.user.id,
        owner_id: SEED.user.id,
        agent_type: AgentType.None,
        settings: "{}",
        import_spec: "raw",
        data_version: 0,
      },
      {
        id: SEED.admin.id,
        actor_type: ActorType.User,
        display_name: "E2E Admin",
        user_id: SEED.admin.id,
        owner_id: SEED.admin.id,
        agent_type: AgentType.None,
        settings: "{}",
        import_spec: "raw",
        data_version: 0,
      },
    ],)
    .onConflict((oc,) => oc.column("id",).doNothing())
    .execute();
}

export async function seedCharacter(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("actors",)
    .values({
      id: SEED.character.id,
      actor_type: ActorType.Character,
      display_name: SEED.character.name,
      user_id: SEED.user.id,
      owner_id: SEED.user.id,
      agent_type: AgentType.Ai,
      description: "Character for E2E testing",
      system_prompt: "You are a test character.",
      settings: "{}",
      import_spec: "raw",
      data_version: 0,
    },)
    .execute();
}

export async function seedChat(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("chats",)
    .values({
      id: SEED.chat.id,
      name: SEED.chat.name,
      type: ChatType.Direct,
      mode: ChatMode.Story,
      created_by: SEED.user.id,
    },)
    .onConflict((oc,) => oc.column("id",).doNothing())
    .execute();

  // Add creator as participant
  await db
    .insertInto("chat_participants",)
    .values({
      chat_id: SEED.chat.id,
      actor_id: SEED.user.id,
      role_in_chat: "owner",
    },)
    .onConflict((oc,) => oc.columns(["chat_id", "actor_id",],).doNothing())
    .execute();
}

export async function seedMessage(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("messages",)
    .values({
      id: SEED.message.id,
      chat_id: SEED.chat.id,
      actor_id: SEED.user.id,
      role: "user",
      content: SEED.message.content,
      content_format: "markdown",
      content_type: "text",
      content_encoding: "identity",
      status: "confirmed",
      visibility: "visible",
    },)
    .execute();
}

export async function seedWorld(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("worlds",)
    .values({
      id: SEED.world.id,
      owner_id: SEED.user.id,
      name: SEED.world.name,
      description: SEED.world.description,
      difficulty_modifier: 1,
      difficulty_reroll: "none",
      difficulty_state: "normal",
    },)
    .execute();
}

export async function seedLocation(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("locations",)
    .values({
      id: SEED.location.id,
      world_id: SEED.world.id,
      name: SEED.location.name,
      description: SEED.location.description,
      connections: "[]",
    },)
    .execute();
}

export async function seedItem(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("items",)
    .values({
      id: SEED.item.id,
      world_id: SEED.world.id,
      name: SEED.item.name,
      description: SEED.item.description,
      category: ItemCategory.Weapon,
      rarity: ItemRarity.Common,
      stackable: StackableState.Unique,
      max_stack: 1,
      properties: JSON.stringify({ damage: 5, type: "slashing", },),
      value: 10,
      weight: 3,
    },)
    .execute();
}

export async function seedWorldItem(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("world_items",)
    .values({
      id: `b0000001-0000-4000-a000-${U.slice(24,)}`,
      world_id: SEED.world.id,
      item_id: SEED.item.id,
      location_id: SEED.location.id,
      quantity: 1,
      visibility: "visible",
      respawnable: 0,
    },)
    .execute();
}

export async function seedQuest(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("quests",)
    .values({
      id: SEED.quest.id,
      world_id: SEED.world.id,
      creator_id: SEED.user.id,
      name: SEED.quest.name,
      description: SEED.quest.description,
      type: QuestType.Discovery,
      status: QuestStatus.Active,
      priority: 1,
      target: 1,
      config: "{}",
      progress: 0,
      narrative_hooks: "[]",
      rewards: JSON.stringify({ xp: 100, gold: 50, },),
    },)
    .execute();
}

/**
 * Seed all test data.
 */
export async function seedAll(db: Kysely<DB>,): Promise<void> {
  await seedUsers(db,);
  await seedCharacter(db,);
  await seedChat(db,);
  await seedMessage(db,);
  await seedWorld(db,);
  await seedLocation(db,);
  await seedItem(db,);
  await seedWorldItem(db,);
  await seedQuest(db,);
}

/**
 * Seed a Solo-role user + actor + character + chat owned by that solo user.
 * Required for browser e2e tests that run in demo (auth.required=false)
 * mode: getOrCreateSoloUserForAuth looks up role=UserRole.Solo and uses
 * that user's id as the auth context userId.
 */
export async function seedSolo(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("users",)
    .values({
      id: SEED.solo.id,
      username: SEED.solo.username,
      display_name: "Solo User",
      role: UserRole.Solo,
      status: UserStatus.Active,
      settings: "{}",
    },)
    .onConflict((oc,) => oc.column("username",).doNothing())
    .execute();

  await db
    .insertInto("actors",)
    .values({
      id: SEED.solo.id,
      actor_type: ActorType.User,
      display_name: "Solo User",
      user_id: SEED.solo.id,
      owner_id: SEED.solo.id,
      agent_type: AgentType.None,
      settings: "{}",
      import_spec: "raw",
      data_version: 0,
    },)
    .onConflict((oc,) => oc.column("id",).doNothing())
    .execute();

  // Seed a character visible to solo user (uses separate ID from SEED.character)
  await db
    .insertInto("actors",)
    .values({
      id: SEED.soloCharacter.id,
      actor_type: ActorType.Character,
      display_name: SEED.soloCharacter.name,
      user_id: SEED.solo.id,
      owner_id: SEED.solo.id,
      agent_type: AgentType.Ai,
      description: "Character for E2E testing (solo)",
      system_prompt: "You are a test character.",
      settings: "{}",
      import_spec: "raw",
      data_version: 0,
    },)
    .onConflict((oc,) => oc.column("id",).doNothing())
    .execute();

  await db
    .insertInto("chats",)
    .values({
      id: SEED.soloChat.id,
      name: SEED.soloChat.name,
      type: ChatType.Direct,
      mode: ChatMode.Direct,
      created_by: SEED.solo.id,
    },)
    .onConflict((oc,) => oc.column("id",).doNothing())
    .execute();

  await db
    .insertInto("chat_participants",)
    .values({
      chat_id: SEED.soloChat.id,
      actor_id: SEED.solo.id,
      role_in_chat: "owner",
    },)
    .onConflict((oc,) => oc.columns(["chat_id", "actor_id",],).doNothing())
    .execute();
}
