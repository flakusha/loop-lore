/**
 * Tests for GameMasterService — story turn orchestration
 *
 * Covers: constructor, executeTurn (LLM/Human/Hybrid), acceptResponse,
 * humanOverride, injectNarration, pause/resume, error paths, LLM fallback.
 *
 * Uses in-memory SQLite + Kysely test DB. Mocks generateText callback.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { GmGuidance, } from "../chat/types/config";
import type { Config, } from "../config/schema";
import { GameMasterType, } from "../db/enums";
import { setTestDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { NSFW_POLICY_LEVELS_PROMPT, } from "../prompts";
import { createTestDb, resetTestDb, } from "../test-utils/create-test-db";
import { GameMasterService, type GenerateTextFn, } from "./game-master";
import type { GameMasterConfig, QualityThresholds, } from "./types";

// ── Test DB ──────────────────────────────────────────────────

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

// ── Seed helpers ──────────────────────────────────────────────

/**
 * @param db
 * @param overrides
 */
async function seedChat(db: Kysely<DB>, overrides?: Record<string, unknown>,): Promise<string> {
  const id = (overrides?.id as string | undefined) ?? randomUUID();
  await db
    .insertInto("chats",)
    .values({
      id,
      name: "Test Story",
      type: "direct",
      mode: "story",
      created_by: "user-1",
      ...overrides,
    },)
    .execute();
  return id;
}

/**
 * @param db
 */
async function seedWorld(db: Kysely<DB>,): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto("worlds",)
    .values({
      id,
      owner_id: "user-1",
      name: "Test World",
      scan_depth: 0,
      token_budget: 4096,
      difficulty_modifier: 1,
      difficulty_reroll: "none",
      difficulty_state: "normal",
    },)
    .execute();
  return id;
}

/**
 * @param db
 * @param worldId
 * @param overrides
 */
async function seedLocation(
  db: Kysely<DB>,
  worldId: string,
  overrides?: Record<string, unknown>,
): Promise<string> {
  const id = (overrides?.id as string | undefined) ?? randomUUID();
  await db
    .insertInto("locations",)
    .values({
      id,
      world_id: worldId,
      name: "Tavern",
      connections: "[]",
      ...overrides,
    },)
    .execute();

  // Also create location_state
  await db
    .insertInto("location_states",)
    .values({
      location_id: id,
      world_id: worldId,
      atmosphere: "cozy",
      npcs_present: "[]",
      items_available: "[]",
      hazards: "[]",
    },)
    .execute();

  return id;
}

/**
 * @param db
 * @param overrides
 */
async function seedActor(db: Kysely<DB>, overrides?: Record<string, unknown>,): Promise<string> {
  const id = (overrides?.id as string | undefined) ?? randomUUID();
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "character",
      display_name: "Hero",
      agent_type: "ai",
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
      ...overrides,
    },)
    .execute();
  return id;
}

/**
 * @param db
 * @param chatId
 * @param actorId
 */
async function seedParticipant(db: Kysely<DB>, chatId: string, actorId: string,): Promise<void> {
  await db
    .insertInto("chat_participants",)
    .values({
      chat_id: chatId,
      actor_id: actorId,
      role_in_chat: "member",
    },)
    .execute();
}

/**
 * @param db
 * @param chatId
 * @param actorId
 * @param overrides
 */
async function seedStoryTurn(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  overrides?: Record<string, unknown>,
): Promise<string> {
  const id = (overrides?.id as string | undefined) ?? randomUUID();
  await db
    .insertInto("story_turns",)
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
    },)
    .execute();
  return id;
}

// ── GM config factory ─────────────────────────────────────────

/** */
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

/** */
function makeHumanConfig(): GameMasterConfig {
  return {
    type: GameMasterType.Human,
    humanGM: {
      actorId: "gm-human",
      notifications: true,
    },
  };
}

/** */
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

beforeEach(async () => {
  createLogger({ level: "error", },);
  setTestDatabase(testDb,);

  // Clear all test tables
  resetTestDb(testSqlite,);

  // Seed user for FK constraints (seedChat/seedWorld reference "user-1")
  await testDb.insertInto("users",).values({
    id: "user-1",
    username: "test",
    display_name: "Test",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();
},);

afterAll(() => {
  setTestDatabase(null,);
  testSqlite.close();
},);

// ── Tests ──────────────────────────────────────────────────────

describe("GameMasterService — constructor & state", () => {
  test("creates instance with default getter values before init", () => {
    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId: "nonexistent",
      gmConfig: makeLlmConfig(),
      generateText,
    },);

    expect(gm.currentTurn,).toBe(0,);
    expect(gm.isPaused,).toBe(true,); // state is null → ?? true
    expect(gm.isComplete,).toBe(false,);
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
      },),
    },);

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);

    await gm.initialize();
    expect(gm.currentTurn,).toBe(5,);
    expect(gm.isPaused,).toBe(false,);
  });

  test("initialize throws for nonexistent chat", async () => {
    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId: "no-such-chat",
      gmConfig: makeLlmConfig(),
      generateText,
    },);

    await expect(gm.initialize(),).rejects.toThrow("not found",);
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
      },),
    },);

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);
    await gm.initialize();

    expect(gm.isPaused,).toBe(false,);
    await gm.pause();
    expect(gm.isPaused,).toBe(true,);
    await gm.resume();
    expect(gm.isPaused,).toBe(false,);
  });
});

describe("GameMasterService — executeTurn", () => {
  /** */
  async function seedStoryWorld(): Promise<{
    chatId: string;
    worldId: string;
    actorId: string;
  }> {
    const worldId = await seedWorld(testDb,);
    const locId = await seedLocation(testDb, worldId,);
    const chatId = await seedChat(testDb, {
      world_id: worldId,
      current_location_id: locId,
    },);
    const actorId = await seedActor(testDb,);
    await seedParticipant(testDb, chatId, actorId,);
    return { chatId, worldId, actorId, };
  }

  test("LLM mode: full flow with generateText, creates turn, returns result", async () => {
    const { chatId, actorId, } = await seedStoryWorld();
    let generateCalled = false;

    const generateText: GenerateTextFn = (params,) => {
      generateCalled = true;
      expect(params.systemPrompt,).toBeDefined();
      expect(params.messages.length,).toBeGreaterThanOrEqual(1,);
      return Promise.resolve("*He nods thoughtfully.* I shall investigate the ancient ruins.",);
    };

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);

    const result = await gm.executeTurn(actorId,);

    expect(generateCalled,).toBe(true,);
    expect(result.turnId,).toBeDefined();
    expect(result.turnNumber,).toBe(1,);
    expect(result.actorId,).toBe(actorId,);
    expect(result.prompt,).toBeDefined();
    expect(result.response,).toBeNull();
    expect(result.gmDecision,).toBeDefined();
    expect(result.gmDecision?.nextActorId,).toBe(actorId,);
    expect(result.narration,).toBeNull();

    // Verify story_turn was created in DB
    const turns = await testDb.selectFrom("story_turns",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(turns,).toHaveLength(1,);
    expect(turns[0]!.id,).toBe(result.turnId,);
    expect(turns[0]!.status,).toBe("pending",);
    expect(turns[0]!.gm_decision,).toBeDefined();
  });

  test("LLM mode: injects NSFW policy section when appConfig allows NSFW", async () => {
    const { chatId, actorId, } = await seedStoryWorld();
    let capturedMessages: { role: string; content: string }[] | undefined;

    const generateText: GenerateTextFn = (params,) => {
      capturedMessages = params.messages;
      return Promise.resolve("*He nods.* I understand the boundaries.",);
    };

    // Minimal app-config: NSFW allowed, no template override → code default policy.
    const appConfig = {
      nsfw: { allowNsfw: true, },
      templates: { llm: { systemPrompts: {}, }, },
    } as unknown as Config;

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
      appConfig,
    },);
    await gm.initialize();

    await gm.executeTurn(actorId,);

    expect(capturedMessages,).toBeDefined();
    const systemMessages = capturedMessages!.filter((m,) => m.role === "system");
    expect(systemMessages.some((m,) => m.content.includes("nsfw_policy",)),).toBe(true,);
    expect(
      systemMessages.some((m,) => m.content.includes(NSFW_POLICY_LEVELS_PROMPT,)),
    ).toBe(true,);
  });

  test("LLM mode: omits NSFW policy section when appConfig blocks NSFW", async () => {
    const { chatId, actorId, } = await seedStoryWorld();
    let capturedMessages: { role: string; content: string }[] | undefined;

    const generateText: GenerateTextFn = (params,) => {
      capturedMessages = params.messages;
      return Promise.resolve("*He nods.* I understand the boundaries.",);
    };

    const appConfig = {
      nsfw: { allowNsfw: false, },
      templates: { llm: { systemPrompts: {}, }, },
    } as unknown as Config;

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
      appConfig,
    },);
    await gm.initialize();

    await gm.executeTurn(actorId,);

    expect(capturedMessages,).toBeDefined();
    const systemMessages = capturedMessages!.filter((m,) => m.role === "system");
    expect(systemMessages.some((m,) => m.content.includes("nsfw_policy",)),).toBe(false,);
  });

  test("Human mode: returns minimal prompt, no LLM call", async () => {
    const { chatId, } = await seedStoryWorld();
    let generateCalled = false;

    const generateText: GenerateTextFn = () => {
      generateCalled = true;
      return Promise.resolve("should not be called",);
    };

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeHumanConfig(),
      generateText,
    },);
    await gm.initialize();

    const result = await gm.executeTurn();

    expect(generateCalled,).toBe(false,);
    expect(result.prompt,).toContain("[Human GM]",);
    expect(result.gmDecision,).toBeDefined();
  });

  test("Hybrid mode: calls LLM, works like LLM mode", async () => {
    const { chatId, actorId, } = await seedStoryWorld();
    let generateCalled = false;

    const generateText: GenerateTextFn = () => {
      generateCalled = true;
      return Promise.resolve("The hero advances cautiously.",);
    };

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeHybridConfig(),
      generateText,
    },);

    const result = await gm.executeTurn(actorId,);

    expect(generateCalled,).toBe(true,);
    expect(result.turnId,).toBeDefined();
    expect(result.turnNumber,).toBe(1,);
  });

  test("throws when no story context available (no world_id)", async () => {
    const chatId = await seedChat(testDb,); // no world_id

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);

    await expect(gm.executeTurn(),).rejects.toThrow("No story context available",);
  });

  test("throws when no actors available", async () => {
    const worldId = await seedWorld(testDb,);
    const locId = await seedLocation(testDb, worldId,);
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
      },),
    },);
    // No chat_participants → no actors

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);
    await gm.initialize();

    await expect(gm.executeTurn(),).rejects.toThrow("No available actors",);
  });

  test("LLM decision falls back to hardcoded prompt on generateText error", async () => {
    const { chatId, } = await seedStoryWorld();

    const generateText: GenerateTextFn = () => Promise.reject(new Error("LLM unavailable",),);

    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);
    await gm.initialize();

    // Should not throw — falls back to hardcodedPrompt
    const result = await gm.executeTurn();
    expect(result.turnId,).toBeDefined();
    expect(result.prompt,).toBeDefined();
    // Hardcoded prompt includes actor name
    expect(result.prompt,).toContain("Hero",);
  });

  test("gmGuidance: targetCharacter override + constraints/scene in prompt", async () => {
    const worldId = await seedWorld(testDb,);
    const locId = await seedLocation(testDb, worldId,);
    const chatId = await seedChat(testDb, {
      world_id: worldId,
      current_location_id: locId,
    },);
    const heroId = await seedActor(testDb, { display_name: "Hero", },);
    const villainId = await seedActor(testDb, { display_name: "Villain", },);
    await seedParticipant(testDb, chatId, heroId,);
    await seedParticipant(testDb, chatId, villainId,);

    const gmGuidance: GmGuidance = {
      constraints: ["Keep it tense — no easy answers",],
      targetCharacter: villainId,
      sceneDescription: "A storm rages outside the tavern",
      turnPriority: {},
    };
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeHumanConfig(),
      gmGuidance,
      generateText: () => Promise.resolve("unused",),
    },);
    await gm.initialize();

    const result = await gm.executeTurn();
    expect(result.actorId,).toBe(villainId,);
    expect(result.prompt,).toContain("[Human GM]",);
    expect(result.prompt,).toContain("Keep it tense — no easy answers",);
    expect(result.prompt,).toContain("A storm rages outside the tavern",);
  });
});

describe("GameMasterService — acceptResponse", () => {
  test("throws when turn not found", async () => {
    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId: "chat-1",
      gmConfig: makeLlmConfig(),
      generateText,
    },);

    await expect(gm.acceptResponse("no-such-turn", "response",),).rejects.toThrow(
      "Turn no-such-turn not found",
    );
  });

  test("full accept path: quality evaluation, events, DB update", async () => {
    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb, { display_name: "Hero", },);
    const turnId = await seedStoryTurn(testDb, chatId, actorId,);

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);
    await gm.initialize();

    // Response with good quality markers
    const response = "I am ready. *He steps forward confidently.* Because the shadows cannot stop us. " +
      "The moonlight reveals the path ahead, and the ancient whispers guide our way. " +
      "This unexpected quest requires courage!";

    const result = await gm.acceptResponse(turnId, response,);

    expect(result.accepted,).toBe(true,);
    expect(result.response,).toBe(response,);
    expect(result.qualityEvaluation,).toBeDefined();
    expect(result.qualityEvaluation?.passed,).toBe(true,);
    expect(result.qualityEvaluation?.scores.overall,).toBeGreaterThanOrEqual(70,);
    expect(result.regenerationSuggested,).toBe(false,);
    expect(result.escalated,).toBe(false,);

    // DB turn updated
    const turn = await testDb
      .selectFrom("story_turns",)
      .selectAll()
      .where("id", "=", turnId,)
      .executeTakeFirst();
    expect(turn,).toBeDefined();
    expect(turn?.status,).toBe("accepted",);
    expect(turn?.response_received,).toBe(response,);
    expect(turn?.quality_score,).toBe(result.qualityEvaluation?.scores.overall,);
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
      },),
    },);
    const actorId = await seedActor(testDb, { display_name: "Hero", },);
    const turnId = await seedStoryTurn(testDb, chatId, actorId,);

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
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
    },);
    await gm.initialize();

    // "ok" response scores ~60, which is < 80 (escalate) but >= 30 (regenerate)
    // → escalationReason set, regenerationReason NOT set (60 < 30 is false)
    const result = await gm.acceptResponse(turnId, "ok",);

    expect(result.escalated,).toBe(true,);
    expect(result.accepted,).toBe(false,);
    expect(result.regenerationSuggested,).toBe(false,);
    expect(result.qualityEvaluation,).toBeDefined();
    expect(result.qualityEvaluation?.scores.overall,).toBeLessThan(80,);
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
      },),
    },);
    const actorId = await seedActor(testDb, { display_name: "Hero", },);
    const turnId = await seedStoryTurn(testDb, chatId, actorId,);

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
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
    },);
    await gm.initialize();

    const result = await gm.acceptResponse(turnId, "ok",);

    // With overall ~60, should be below accept(80) but above regen(61) → regeneration
    expect(result.regenerationSuggested,).toBe(true,);
    expect(result.accepted,).toBe(false,);
  });

  test("humanOverride updates turn with decision", async () => {
    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb,);
    const turnId = await seedStoryTurn(testDb, chatId, actorId,);

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeHumanConfig(),
      generateText,
    },);

    const decision = {
      nextActorId: actorId,
      turnPrompt: "Human GM override prompt",
      turnConstraints: { maxTokens: 500, },
      questUpdates: [],
      worldStateChanges: [],
    };

    await gm.humanOverride(chatId, turnId, decision,);

    const turn = await testDb
      .selectFrom("story_turns",)
      .selectAll()
      .where("id", "=", turnId,)
      .executeTakeFirst();
    expect(turn,).toBeDefined();
    expect(turn?.status,).toBe("accepted",);
    expect(turn?.gm_decision,).toBeDefined();

    const parsed = JSON.parse(turn?.gm_decision ?? "",) as { nextActorId: string; turnPrompt: string };
    expect(parsed.nextActorId,).toBe(actorId,);
    expect(parsed.turnPrompt,).toBe("Human GM override prompt",);
  });
});

describe("GameMasterService — injectNarration", () => {
  test("creates messages when narrator actor exists", async () => {
    const worldId = await seedWorld(testDb,);
    const chatId = await seedChat(testDb, {
      world_id: worldId,
      mode: "story",
    },);

    // Narrator actor
    const narratorId = await seedActor(testDb, {
      actor_type: "narrator",
      agent_type: "narrator",
      display_name: "Narrator",
    },);

    // Also create a second story-mode chat
    await seedChat(testDb, {
      id: randomUUID(),
      world_id: worldId,
      mode: "story",
    },);

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);

    await gm.injectNarration(worldId, "The wind howls through the valley.",);

    const messages = await testDb
      .selectFrom("messages",)
      .selectAll()
      .where("actor_id", "=", narratorId,)
      .execute();
    expect(messages,).toHaveLength(2,); // 2 story-mode chats
    for (const msg of messages) {
      expect(msg.content,).toBe("The wind howls through the valley.",);
      expect(msg.role,).toBe("system",);
      expect(msg.content_type,).toBe("narration",);
    }
  });

  test("no-op when no narrator actor exists", async () => {
    const worldId = await seedWorld(testDb,);
    const chatId = await seedChat(testDb, {
      world_id: worldId,
      mode: "story",
    },);
    // No narrator actor

    const generateText: GenerateTextFn = () => Promise.resolve("test",);
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: makeLlmConfig(),
      generateText,
    },);

    await gm.injectNarration(worldId, "Test narration",);

    const messages = await testDb.selectFrom("messages",).selectAll().execute();
    expect(messages,).toHaveLength(0,);
  });
});

describe("GameMasterService — per-actor multi-LLM model assignment", () => {
  test("llmDecision uses per-actor model when actorModels is set", async () => {
    const worldId = await seedWorld(testDb,);
    const locId = await seedLocation(testDb, worldId,);
    const chatId = await seedChat(testDb, { world_id: worldId, current_location_id: locId, },);
    const actorId = await seedActor(testDb,);
    await seedParticipant(testDb, chatId, actorId,);
    const captured: { model?: string; provider?: string }[] = [];
    const generateText: GenerateTextFn = (params,) => {
      captured.push({ model: params.model, provider: params.provider, },);
      return Promise.resolve("*He acts.*",);
    };
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: {
        type: GameMasterType.Llm,
        llmConfig: {
          model: "gm-model",
          provider: "gm-provider",
          systemPrompt: "You are the Game Master.",
          temperature: 0.7,
          maxTokens: 800,
        },
        actorModels: { [actorId]: { model: "actor-model", provider: "actor-provider", }, },
      },
      generateText,
    },);
    await gm.initialize();
    await gm.executeTurn(actorId,);
    expect(captured.length,).toBeGreaterThanOrEqual(1,);
    expect(captured[0]!.model,).toBe("actor-model",);
    expect(captured[0]!.provider,).toBe("actor-provider",);
  });

  test("falls back to GM llmConfig model when actor has no override", async () => {
    const worldId = await seedWorld(testDb,);
    const locId = await seedLocation(testDb, worldId,);
    const chatId = await seedChat(testDb, { world_id: worldId, current_location_id: locId, },);
    const actorId = await seedActor(testDb,);
    await seedParticipant(testDb, chatId, actorId,);
    const captured: { model?: string }[] = [];
    const generateText: GenerateTextFn = (params,) => {
      captured.push({ model: params.model, },);
      return Promise.resolve("*He acts.*",);
    };
    const gm = new GameMasterService({
      db: testDb,
      chatId,
      gmConfig: {
        type: GameMasterType.Llm,
        llmConfig: {
          model: "gm-model",
          provider: "gm-provider",
          systemPrompt: "You are the Game Master.",
          temperature: 0.7,
          maxTokens: 800,
        },
      },
      generateText,
    },);
    await gm.initialize();
    await gm.executeTurn(actorId,);
    expect(captured[0]!.model,).toBe("gm-model",);
  });
});
