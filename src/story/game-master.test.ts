/**
 * Tests for GameMasterService — story turn orchestration
 *
 * Covers: constructor, executeTurn (LLM/Human/Hybrid), acceptResponse,
 * humanOverride, injectNarration, pause/resume, error paths, LLM fallback.
 *
 * Uses in-memory SQLite + Kysely test DB. Mocks generateText callback.
 */
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import type { DB } from "../db/schema";
import { createLogger } from "../logger";
import { createSqliteDialect, setTestDatabase } from "../db/index";
import { GameMasterService, type GenerateTextFn } from "./game-master";
import type { GameMasterConfig, QualityThresholds } from "./types";
import { GameMasterType } from "../db/enums";

// ── Test DB factory ───────────────────────────────────────────

interface TestDbResult {
  sqlite: Database;
  db: Kysely<DB>;
}

function createTestDb(): TestDbResult {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");

  const dialect = createSqliteDialect(sqlite);
  const db = new Kysely<DB>({ dialect });

  // Core tables
  sqlite.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active',
      settings TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE chats (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'direct',
      mode TEXT NOT NULL DEFAULT 'direct', created_by TEXT NOT NULL,
      world_id TEXT, current_location_id TEXT, story_state TEXT,
      gm_config TEXT, turn_strategy TEXT, max_turns INTEGER, auto_advance INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE actors (
      id TEXT PRIMARY KEY, actor_type TEXT NOT NULL DEFAULT 'user', display_name TEXT NOT NULL,
      system_prompt TEXT, personality TEXT, description TEXT, scenario TEXT,
      mes_example TEXT, post_history_instructions TEXT,
      agent_type TEXT NOT NULL DEFAULT 'none', settings TEXT NOT NULL DEFAULT '{}',
      data_version INTEGER NOT NULL DEFAULT 1, import_spec TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE chat_participants (
      chat_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      role_in_chat TEXT NOT NULL DEFAULT 'member',
      impersonate_actor_id TEXT, persona_id TEXT, last_read_message_id TEXT,
      talkativity INTEGER NOT NULL DEFAULT 5,
      initiative INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (chat_id, actor_id)
    )
  `);
  sqlite.run(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      parent_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
      content_format TEXT NOT NULL DEFAULT 'markdown',
      content_type TEXT NOT NULL DEFAULT 'text', content_encoding TEXT NOT NULL DEFAULT 'identity',
      model_id TEXT, provider TEXT,
      token_count_prompt INTEGER, token_count_completion INTEGER, token_count_total INTEGER,
      status TEXT NOT NULL DEFAULT 'sending', visibility TEXT NOT NULL DEFAULT 'visible',
      continuation_index INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Story domain tables
  sqlite.run(`
    CREATE TABLE worlds (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, lore TEXT, scan_depth INTEGER NOT NULL DEFAULT 0,
      token_budget INTEGER NOT NULL DEFAULT 4096,
      difficulty_modifier REAL NOT NULL DEFAULT 1,
      difficulty_reroll TEXT NOT NULL DEFAULT 'off',
      difficulty_state TEXT NOT NULL DEFAULT 'alive',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE locations (
      id TEXT PRIMARY KEY, world_id TEXT, name TEXT NOT NULL,
      description TEXT, connections TEXT NOT NULL DEFAULT '[]',
      parent_location_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE location_states (
      location_id TEXT NOT NULL, world_id TEXT NOT NULL,
      description_override TEXT, atmosphere TEXT,
      npcs_present TEXT NOT NULL DEFAULT '[]', items_available TEXT NOT NULL DEFAULT '[]',
      time_of_day TEXT, weather TEXT, hazards TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE story_turns (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, turn_number INTEGER NOT NULL,
      actor_id TEXT NOT NULL, turn_type TEXT NOT NULL DEFAULT 'character_action',
      prompt_sent TEXT NOT NULL DEFAULT '', response_received TEXT,
      quality_score REAL, quality_details TEXT,
      regeneration_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', gm_decision TEXT,
      world_events TEXT NOT NULL DEFAULT '[]', quest_progress TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE npc_states (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, world_id TEXT NOT NULL,
      location_id TEXT, health REAL NOT NULL DEFAULT 100,
      mental_state TEXT NOT NULL DEFAULT 'calm',
      knowledge TEXT NOT NULL DEFAULT '{}', relationships TEXT NOT NULL DEFAULT '{}',
      inventory TEXT NOT NULL DEFAULT '[]', schedule TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE quests (
      id TEXT PRIMARY KEY, world_id TEXT NOT NULL, creator_id TEXT NOT NULL,
      name TEXT NOT NULL, description TEXT,
      type TEXT NOT NULL DEFAULT 'collection', status TEXT NOT NULL DEFAULT 'active',
      priority INTEGER NOT NULL DEFAULT 0, config TEXT NOT NULL DEFAULT '{}',
      progress INTEGER NOT NULL DEFAULT 0, target INTEGER NOT NULL DEFAULT 1,
      start_time TEXT, deadline TEXT, time_location_id TEXT,
      rewards TEXT NOT NULL DEFAULT '[]', narrative_hooks TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `);

  // Tables needed by PromptAssembler (used in llmDecision)
  sqlite.run(
    `CREATE TABLE actor_lore_entries (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, content TEXT NOT NULL, keys TEXT NOT NULL DEFAULT '[]', position TEXT NOT NULL DEFAULT 'before_char', "constant" INTEGER NOT NULL DEFAULT 0, "selective" INTEGER NOT NULL DEFAULT 0, insertion_order INTEGER DEFAULT 100, priority INTEGER DEFAULT 100, sort_order INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  sqlite.run(
    `CREATE TABLE world_lore_entries (id TEXT PRIMARY KEY, world_id TEXT NOT NULL, content TEXT NOT NULL, keys TEXT NOT NULL DEFAULT '[]', position TEXT NOT NULL DEFAULT 'before_char', "constant" INTEGER NOT NULL DEFAULT 0, "selective" INTEGER NOT NULL DEFAULT 0, insertion_order INTEGER DEFAULT 100, priority INTEGER DEFAULT 100, sort_order INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  sqlite.run(
    `CREATE TABLE actor_memories (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, content TEXT NOT NULL, memory_type TEXT NOT NULL DEFAULT 'fact', confidence REAL NOT NULL DEFAULT 1, importance INTEGER NOT NULL DEFAULT 1, keywords TEXT DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );

  return { sqlite, db };
}

// ── Seed helpers ──────────────────────────────────────────────

async function seedChat(db: Kysely<DB>, overrides?: Record<string, unknown>): Promise<string> {
  const id = (overrides?.id as string | undefined) ?? randomUUID();
  await db
    .insertInto("chats")
    .values({
      id,
      name: "Test Story",
      type: "direct",
      mode: "story",
      created_by: "user-1",
      ...overrides,
    })
    .execute();
  return id;
}

async function seedWorld(db: Kysely<DB>): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto("worlds")
    .values({
      id,
      owner_id: "user-1",
      name: "Test World",
      scan_depth: 0,
      token_budget: 4096,
      difficulty_modifier: 1,
      difficulty_reroll: "none",
      difficulty_state: "normal",
    })
    .execute();
  return id;
}

async function seedLocation(
  db: Kysely<DB>,
  worldId: string,
  overrides?: Record<string, unknown>,
): Promise<string> {
  const id = (overrides?.id as string | undefined) ?? randomUUID();
  await db
    .insertInto("locations")
    .values({
      id,
      world_id: worldId,
      name: "Tavern",
      connections: "[]",
      ...overrides,
    })
    .execute();

  // Also create location_state
  await db
    .insertInto("location_states")
    .values({
      location_id: id,
      world_id: worldId,
      atmosphere: "cozy",
      npcs_present: "[]",
      items_available: "[]",
      hazards: "[]",
    })
    .execute();

  return id;
}

async function seedActor(db: Kysely<DB>, overrides?: Record<string, unknown>): Promise<string> {
  const id = (overrides?.id as string | undefined) ?? randomUUID();
  await db
    .insertInto("actors")
    .values({
      id,
      actor_type: "character",
      display_name: "Hero",
      agent_type: "ai",
      settings: "{}",
      data_version: 1,
      import_spec: "{}",
      ...overrides,
    })
    .execute();
  return id;
}

async function seedParticipant(db: Kysely<DB>, chatId: string, actorId: string): Promise<void> {
  await db
    .insertInto("chat_participants")
    .values({
      chat_id: chatId,
      actor_id: actorId,
      role_in_chat: "member",
    })
    .execute();
}

async function seedStoryTurn(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  overrides?: Record<string, unknown>,
): Promise<string> {
  const id = (overrides?.id as string | undefined) ?? randomUUID();
  await db
    .insertInto("story_turns")
    .values({
      id,
      chat_id: chatId,
      turn_number: 1,
      actor_id: actorId,
      turn_type: "character_action",
      prompt_sent: "What do you do?",
      status: "pending",
      regeneration_count: 0,
      world_events: "[]",
      quest_progress: "[]",
      ...overrides,
    })
    .execute();
  return id;
}

// ── GM config factory ─────────────────────────────────────────

function makeLlmConfig(): GameMasterConfig {
  return {
    type: GameMasterType.Llm,
    llmConfig: {
      model: "test-model",
      provider: "test-provider",
      systemPrompt: "You are the Game Master.",
      temperature: 0.7,
      maxTokens: 800,
    },
  };
}

function makeHumanConfig(): GameMasterConfig {
  return {
    type: GameMasterType.Human,
    humanGM: {
      actorId: "gm-human",
      notifications: true,
    },
  };
}

function makeHybridConfig(): GameMasterConfig {
  return {
    type: GameMasterType.Hybrid,
    llmConfig: {
      model: "test-model",
      provider: "test-provider",
      systemPrompt: "You are the Game Master.",
      temperature: 0.7,
      maxTokens: 800,
    },
    escalationThreshold: 40,
  };
}

// ── Setup ─────────────────────────────────────────────────────

const testEnv = createTestDb();
const testSqlite = testEnv.sqlite;
const testDb = testEnv.db;

beforeEach(async () => {
  createLogger({ level: "error" });
  setTestDatabase(testDb);

  // Clear all test tables
  await testDb.deleteFrom("story_turns").execute();
  await testDb.deleteFrom("messages").execute();
  await testDb.deleteFrom("chat_participants").execute();
  await testDb.deleteFrom("npc_states").execute();
  await testDb.deleteFrom("quests").execute();
  await testDb.deleteFrom("location_states").execute();
  await testDb.deleteFrom("locations").execute();
  await testDb.deleteFrom("worlds").execute();
  await testDb.deleteFrom("actors").execute();
  await testDb.deleteFrom("chats").execute();
  await testDb.deleteFrom("users").execute();
});

afterAll(() => {
  setTestDatabase(null);
  testSqlite.close();
});

// ── Tests ──────────────────────────────────────────────────────

describe("GameMasterService — constructor & state", () => {
  test("creates instance with default getter values before init", () => {
    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId: "nonexistent",
      gmConfig: makeLlmConfig(),
      generateText,
    });

    expect(gm.currentTurn).toBe(0);
    expect(gm.isPaused).toBe(true); // state is null → ?? true
    expect(gm.isComplete).toBe(false);
  });

  test("initialize loads state from DB", async () => {
    const chatId = await seedChat(testDb, {
      story_state: JSON.stringify({
        currentTurn: 5,
        currentActorId: null,
        turnOrder: [],
        strategy: "hybrid",
        isPaused: false,
        lastTurnCompletedAt: null,
        pendingRegeneration: null,
      }),
    });

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });

    await gm.initialize();
    expect(gm.currentTurn).toBe(5);
    expect(gm.isPaused).toBe(false);
  });

  test("initialize throws for nonexistent chat", async () => {
    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId: "no-such-chat",
      gmConfig: makeLlmConfig(),
      generateText,
    });

    await expect(gm.initialize()).rejects.toThrow("not found");
  });

  test("pause and resume delegate to turn manager", async () => {
    const chatId = await seedChat(testDb, {
      story_state: JSON.stringify({
        currentTurn: 0,
        currentActorId: null,
        turnOrder: [],
        strategy: "hybrid",
        isPaused: false,
        lastTurnCompletedAt: null,
        pendingRegeneration: null,
      }),
    });

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });
    await gm.initialize();

    expect(gm.isPaused).toBe(false);
    await gm.pause();
    expect(gm.isPaused).toBe(true);
    await gm.resume();
    expect(gm.isPaused).toBe(false);
  });
});

describe("GameMasterService — executeTurn", () => {
  async function seedStoryWorld(): Promise<{
    chatId: string;
    worldId: string;
    actorId: string;
  }> {
    const worldId = await seedWorld(testDb);
    const locId = await seedLocation(testDb, worldId);
    const chatId = await seedChat(testDb, {
      world_id: worldId,
      current_location_id: locId,
    });
    const actorId = await seedActor(testDb);
    await seedParticipant(testDb, chatId, actorId);
    return { chatId, worldId, actorId };
  }

  test("LLM mode: full flow with generateText, creates turn, returns result", async () => {
    const { chatId, actorId } = await seedStoryWorld();
    let generateCalled = false;

    const generateText: GenerateTextFn = (params) => {
      generateCalled = true;
      expect(params.systemPrompt).toBeDefined();
      expect(params.messages.length).toBeGreaterThanOrEqual(1);
      return Promise.resolve("*He nods thoughtfully.* I shall investigate the ancient ruins.");
    };

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });

    const result = await gm.executeTurn(actorId);

    expect(generateCalled).toBe(true);
    expect(result.turnId).toBeDefined();
    expect(result.turnNumber).toBe(1);
    expect(result.actorId).toBe(actorId);
    expect(result.prompt).toBeDefined();
    expect(result.response).toBeNull();
    expect(result.gmDecision).toBeDefined();
    expect(result.gmDecision?.nextActorId).toBe(actorId);
    expect(result.narration).toBeNull();

    // Verify story_turn was created in DB
    const turns = await testDb.selectFrom("story_turns").selectAll().where("chat_id", "=", chatId).execute();
    expect(turns).toHaveLength(1);
    expect(turns[0]!.id).toBe(result.turnId);
    expect(turns[0]!.status).toBe("pending");
    expect(turns[0]!.gm_decision).toBeDefined();
  });

  test("Human mode: returns minimal prompt, no LLM call", async () => {
    const { chatId } = await seedStoryWorld();
    let generateCalled = false;

    const generateText: GenerateTextFn = () => {
      generateCalled = true;
      return Promise.resolve("should not be called");
    };

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeHumanConfig(),
      generateText,
    });
    await gm.initialize();

    const result = await gm.executeTurn();

    expect(generateCalled).toBe(false);
    expect(result.prompt).toContain("[Human GM]");
    expect(result.gmDecision).toBeDefined();
  });

  test("Hybrid mode: calls LLM, works like LLM mode", async () => {
    const { chatId, actorId } = await seedStoryWorld();
    let generateCalled = false;

    const generateText: GenerateTextFn = () => {
      generateCalled = true;
      return Promise.resolve("The hero advances cautiously.");
    };

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeHybridConfig(),
      generateText,
    });

    const result = await gm.executeTurn(actorId);

    expect(generateCalled).toBe(true);
    expect(result.turnId).toBeDefined();
    expect(result.turnNumber).toBe(1);
  });

  test("throws when no story context available (no world_id)", async () => {
    const chatId = await seedChat(testDb); // no world_id

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });

    await expect(gm.executeTurn()).rejects.toThrow("No story context available");
  });

  test("throws when no actors available", async () => {
    const worldId = await seedWorld(testDb);
    const locId = await seedLocation(testDb, worldId);
    const chatId = await seedChat(testDb, {
      world_id: worldId,
      current_location_id: locId,
      story_state: JSON.stringify({
        currentTurn: 0,
        currentActorId: null,
        turnOrder: [],
        strategy: "hybrid",
        isPaused: false,
        lastTurnCompletedAt: null,
        pendingRegeneration: null,
      }),
    });
    // No chat_participants → no actors

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });
    await gm.initialize();

    await expect(gm.executeTurn()).rejects.toThrow("No available actors");
  });

  test("LLM decision falls back to hardcoded prompt on generateText error", async () => {
    const { chatId } = await seedStoryWorld();

    const generateText: GenerateTextFn = () => Promise.reject(new Error("LLM unavailable"));

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });
    await gm.initialize();

    // Should not throw — falls back to hardcodedPrompt
    const result = await gm.executeTurn();
    expect(result.turnId).toBeDefined();
    expect(result.prompt).toBeDefined();
    // Hardcoded prompt includes actor name
    expect(result.prompt).toContain("Hero");
  });
});

describe("GameMasterService — acceptResponse", () => {
  test("throws when turn not found", async () => {
    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId: "chat-1",
      gmConfig: makeLlmConfig(),
      generateText,
    });

    await expect(gm.acceptResponse("no-such-turn", "response")).rejects.toThrow(
      "Turn no-such-turn not found",
    );
  });

  test("full accept path: quality evaluation, events, DB update", async () => {
    const chatId = await seedChat(testDb);
    const actorId = await seedActor(testDb, { display_name: "Hero" });
    const turnId = await seedStoryTurn(testDb, chatId, actorId);

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });
    await gm.initialize();

    // Response with good quality markers
    const response =
      "I am ready. *He steps forward confidently.* Because the shadows cannot stop us. " +
      "The moonlight reveals the path ahead, and the ancient whispers guide our way. " +
      "This unexpected quest requires courage!";

    const result = await gm.acceptResponse(turnId, response);

    expect(result.accepted).toBe(true);
    expect(result.response).toBe(response);
    expect(result.qualityEvaluation).toBeDefined();
    expect(result.qualityEvaluation?.passed).toBe(true);
    expect(result.qualityEvaluation?.scores.overall).toBeGreaterThanOrEqual(70);
    expect(result.regenerationSuggested).toBe(false);
    expect(result.escalated).toBe(false);

    // DB turn updated
    const turn = await testDb
      .selectFrom("story_turns")
      .selectAll()
      .where("id", "=", turnId)
      .executeTakeFirst();
    expect(turn).toBeDefined();
    expect(turn?.status).toBe("accepted");
    expect(turn?.response_received).toBe(response);
    expect(turn?.quality_score).toBe(result.qualityEvaluation?.scores.overall);
  });

  test("escalation path: custom thresholds trigger escalation", async () => {
    const chatId = await seedChat(testDb, {
      story_state: JSON.stringify({
        currentTurn: 0,
        currentActorId: null,
        turnOrder: [],
        strategy: "hybrid",
        isPaused: false,
        lastTurnCompletedAt: null,
        pendingRegeneration: null,
      }),
    });
    const actorId = await seedActor(testDb, { display_name: "Hero" });
    const turnId = await seedStoryTurn(testDb, chatId, actorId);

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const thresholds: QualityThresholds = {
      accept: 100,
      regenerate: 30,
      escalate: 80,
      maxRegenerations: 3,
    };

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
      qualityThresholds: thresholds,
    });
    await gm.initialize();

    // "ok" response scores ~60, which is < 80 (escalate) but >= 30 (regenerate)
    // → escalationReason set, regenerationReason NOT set (60 < 30 is false)
    const result = await gm.acceptResponse(turnId, "ok");

    expect(result.escalated).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.regenerationSuggested).toBe(false);
    expect(result.qualityEvaluation).toBeDefined();
    expect(result.qualityEvaluation?.scores.overall).toBeLessThan(80);
  });

  test("regeneration path: custom thresholds trigger regeneration", async () => {
    const chatId = await seedChat(testDb, {
      story_state: JSON.stringify({
        currentTurn: 0,
        currentActorId: null,
        turnOrder: [],
        strategy: "hybrid",
        isPaused: false,
        lastTurnCompletedAt: null,
        pendingRegeneration: null,
      }),
    });
    const actorId = await seedActor(testDb, { display_name: "Hero" });
    const turnId = await seedStoryTurn(testDb, chatId, actorId);

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    // "ok" scores ~60 overall with no context
    // Set escalate < 60 (no escalation), regen > 60 (triggers regen), accept > 60 (not accepted)
    const thresholds: QualityThresholds = {
      accept: 80,
      regenerate: 61,
      escalate: 20,
      maxRegenerations: 3,
    };

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
      qualityThresholds: thresholds,
    });
    await gm.initialize();

    const result = await gm.acceptResponse(turnId, "ok");

    // With overall ~60, should be below accept(80) but above regen(61) → regeneration
    expect(result.regenerationSuggested).toBe(true);
    expect(result.accepted).toBe(false);
  });

  test("humanOverride updates turn with decision", async () => {
    const chatId = await seedChat(testDb);
    const actorId = await seedActor(testDb);
    const turnId = await seedStoryTurn(testDb, chatId, actorId);

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeHumanConfig(),
      generateText,
    });

    const decision = {
      nextActorId: actorId,
      turnPrompt: "Human GM override prompt",
      turnConstraints: { maxTokens: 500 },
      questUpdates: [],
      worldStateChanges: [],
    };

    await gm.humanOverride(chatId, turnId, decision);

    const turn = await testDb
      .selectFrom("story_turns")
      .selectAll()
      .where("id", "=", turnId)
      .executeTakeFirst();
    expect(turn).toBeDefined();
    expect(turn?.status).toBe("accepted");
    expect(turn?.gm_decision).toBeDefined();

    const parsed = JSON.parse(turn?.gm_decision ?? "") as { nextActorId: string; turnPrompt: string };
    expect(parsed.nextActorId).toBe(actorId);
    expect(parsed.turnPrompt).toBe("Human GM override prompt");
  });
});

describe("GameMasterService — injectNarration", () => {
  test("creates messages when narrator actor exists", async () => {
    const worldId = await seedWorld(testDb);
    const chatId = await seedChat(testDb, {
      world_id: worldId,
      mode: "story",
    });

    // Narrator actor
    const narratorId = await seedActor(testDb, {
      actor_type: "narrator",
      agent_type: "narrator",
      display_name: "Narrator",
    });

    // Also create a second story-mode chat
    await seedChat(testDb, {
      id: randomUUID(),
      world_id: worldId,
      mode: "story",
    });

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });

    await gm.injectNarration(worldId, "The wind howls through the valley.");

    const messages = await testDb
      .selectFrom("messages")
      .selectAll()
      .where("actor_id", "=", narratorId)
      .execute();
    expect(messages).toHaveLength(2); // 2 story-mode chats
    for (const msg of messages) {
      expect(msg.content).toBe("The wind howls through the valley.");
      expect(msg.role).toBe("system");
      expect(msg.content_type).toBe("narration");
    }
  });

  test("no-op when no narrator actor exists", async () => {
    const worldId = await seedWorld(testDb);
    const chatId = await seedChat(testDb, {
      world_id: worldId,
      mode: "story",
    });
    // No narrator actor

    const generateText: GenerateTextFn = () => Promise.resolve("test");
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    });

    await gm.injectNarration(worldId, "Test narration");

    const messages = await testDb.selectFrom("messages").selectAll().execute();
    expect(messages).toHaveLength(0);
  });
});
