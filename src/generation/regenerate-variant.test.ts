/**
 * Tests for message swipe/replay-branch regeneration.
 *
 * Verifies that POST /api/generation/regenerate (messageId path) creates a NEW
 * sibling variant (same parent_id, swipe_index = max+1) instead of mutating the
 * original, enforces owner/author permission, and is idempotent while a regen
 * variant is still pending.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { listMessages, } from "../chat/service";
import type { Config, } from "../config/schema";
import { configSchema, } from "../config/schema-class";
import { setTestDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { handleRegenerate, } from "./generation-routes";
import { getProvider, registerProvider, unregisterProvider, } from "./providers/registry";
import type {
  GenerateRequest as ProviderRequest,
  GenerateResponse,
  LLMProvider,
  ModelInfo,
  ProviderCapabilities,
  StreamHandler,
} from "./providers/types";
import { VALID_REGEN_STYLES, } from "./smart-regen";

const USER_ID = "u-owner";
const OTHER_ID = "u-other";
const ACTOR_ID = "a-char";
const CHAT_ID = "c-1";
const PARENT_ID = "m-user";
const ORIGINAL_ID = "m-original";

/** */
async function seed(): Promise<{ db: Kysely<DB>; sqlite: Database }> {
  const { db, sqlite, } = await createTestDb();

  await insertUsers(db, "owner", "Owner", { id: USER_ID, } as never,);
  await insertUsers(db, "other", "Other", { id: OTHER_ID, } as never,);
  await insertActors(db, "Owner User", { id: USER_ID, owner_id: USER_ID, } as never,);
  await insertActors(db, "Character", { id: ACTOR_ID, owner_id: USER_ID, } as never,);
  await insertChats(db, "Chat", USER_ID, { id: CHAT_ID, } as never,);

  // User prompt (root of the branch).
  await insertMessages(db, CHAT_ID, USER_ID, "user", "Hello", {
    id: PARENT_ID,
    visibility: "visible",
    status: "confirmed",
  } as never,);

  // Original assistant variant, plus one pre-existing alternative.
  await insertMessages(db, CHAT_ID, ACTOR_ID, "assistant", "Response A", {
    id: ORIGINAL_ID,
    parent_id: PARENT_ID,
    swipe_index: 0,
    visibility: "visible",
    status: "confirmed",
  } as never,);
  await insertMessages(db, CHAT_ID, ACTOR_ID, "assistant", "Response B", {
    id: "m-alt",
    parent_id: PARENT_ID,
    swipe_index: 1,
    visibility: "visible",
    status: "confirmed",
  } as never,);

  return { db, sqlite, };
}

describe("handleRegenerate (messageId → new sibling variant)", () => {
  test("creates a new sibling variant with swipe_index = max+1, preserving the old row", async () => {
    const { db, } = await seed();

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as {
      ok: boolean;
      variantMessageId: string;
      swipeIndex: number;
      replayed: boolean;
    };
    expect(data.ok,).toBe(true,);
    expect(data.replayed,).toBe(false,);
    expect(data.swipeIndex,).toBe(2,);

    // New row: same parent, next swipe index, pending status, content placeholder.
    const created = await db
      .selectFrom("messages",)
      .select(["id", "parent_id", "swipe_index", "status", "visibility", "content", "actor_id",],)
      .where("id", "=", data.variantMessageId,)
      .executeTakeFirst();

    expect(created,).toBeDefined();
    expect(created!.parent_id,).toBe(PARENT_ID,);
    expect(created!.swipe_index,).toBe(2,);
    expect(created!.status,).toBe("sending",);
    expect(created!.visibility,).toBe("visible",);
    expect(created!.content,).toBe("Response A",);
    expect(created!.actor_id,).toBe(ACTOR_ID,);

    // Original + alternative unchanged.
    const originals = await db
      .selectFrom("messages",)
      .select(["id", "swipe_index", "status",],)
      .where("id", "in", [ORIGINAL_ID, "m-alt",],)
      .orderBy("swipe_index", "asc",)
      .execute();
    expect(originals.map((m,) => [m.id, m.swipe_index, m.status,]),).toEqual([
      [ORIGINAL_ID, 0, "confirmed",],
      ["m-alt", 1, "confirmed",],
    ],);
  });

  test("new variant is visible to listMessages with incremented counter", async () => {
    const { db, } = await seed();

    await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );

    const { data, } = await listMessages(db, { chatId: CHAT_ID, parentId: PARENT_ID, },);
    const variants = data.filter((m,) => m.parent_id === PARENT_ID);
    expect(variants.length,).toBe(3,);
    for (const v of variants) {
      expect(v.totalVariants,).toBe(3,);
    }
  });

  test("rejects a non-owner, non-author, non-admin user", async () => {
    const { db, } = await seed();

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: OTHER_ID, userRole: "user", },
    );
    expect(res.status,).toBe(403,);

    // No sibling created.
    const count = await db
      .selectFrom("messages",)
      .select(db.fn.countAll<number>().as("n",),)
      .where("chat_id", "=", CHAT_ID,)
      .where("parent_id", "=", PARENT_ID,)
      .executeTakeFirst();
    expect(count?.n,).toBe(2,);
  });

  test("is idempotent while a regen variant is pending (no duplicate)", async () => {
    const { db, } = await seed();

    const first = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const firstData = (await first.json()) as { variantMessageId: string; replayed: boolean };

    // Repeat before the pending variant resolves.
    const second = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const secondData = (await second.json()) as {
      variantMessageId: string;
      replayed: boolean;
      swipeIndex: number;
    };

    expect(secondData.replayed,).toBe(true,);
    expect(secondData.variantMessageId,).toBe(firstData.variantMessageId,);

    // Still exactly 3 siblings (no 4th duplicate).
    const count = await db
      .selectFrom("messages",)
      .select(db.fn.countAll<number>().as("n",),)
      .where("chat_id", "=", CHAT_ID,)
      .where("parent_id", "=", PARENT_ID,)
      .executeTakeFirst();
    expect(count?.n,).toBe(3,);
  });

  test("returns the original variantId after its pending variant resolves", async () => {
    const { db, } = await seed();

    await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );

    // Resolve the pending variant (simulate the generation pipeline confirming it).
    await db
      .updateTable("messages",)
      .set({ status: "confirmed", },)
      .where("chat_id", "=", CHAT_ID,)
      .where("parent_id", "=", PARENT_ID,)
      .where("status", "=", "sending",)
      .execute();

    // A fresh request now creates a brand-new variant rather than replaying.
    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const data = (await res.json()) as { replayed: boolean; swipeIndex: number };
    expect(data.replayed,).toBe(false,);
    expect(data.swipeIndex,).toBe(3,);
  });
});

describe("handleRegenerate style threading (BUG-smart-regen-style-not-threaded-through)", () => {
  test("encodes style into the variant's idempotency_key and surfaces it on the response", async () => {
    const { db, } = await seed();

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, style: "funnier", },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as {
      variantMessageId: string;
      replayed: boolean;
      style: string | null;
    };
    expect(data.replayed,).toBe(false,);
    expect(data.style,).toBe("funnier",);

    const created = await db
      .selectFrom("messages",)
      .select(["idempotency_key",],)
      .where("id", "=", data.variantMessageId,)
      .executeTakeFirst();
    expect(created?.idempotency_key,).toBe(`regen:variant:${PARENT_ID}:funnier`,);
  });

  test("style null is encoded as ':plain' so it never collides with named styles", async () => {
    const { db, } = await seed();

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const data = (await res.json()) as {
      variantMessageId: string;
      style: string | null;
    };
    expect(data.style,).toBeNull();

    const created = await db
      .selectFrom("messages",)
      .select(["idempotency_key",],)
      .where("id", "=", data.variantMessageId,)
      .executeTakeFirst();
    expect(created?.idempotency_key,).toBe(`regen:variant:${PARENT_ID}:plain`,);
  });

  test("different styles for the same parent are distinct pending variants (no cross-replay)", async () => {
    const { db, } = await seed();

    const funnier = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, style: "funnier", },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const funnierData = (await funnier.json()) as { variantMessageId: string; swipeIndex: number };

    const darker = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, style: "darker", },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const darkerData = (await darker.json()) as {
      variantMessageId: string;
      replayed: boolean;
      swipeIndex: number;
    };

    expect(darkerData.replayed,).toBe(false,);
    expect(darkerData.variantMessageId,).not.toBe(funnierData.variantMessageId,);
    expect(darkerData.swipeIndex,).toBe(funnierData.swipeIndex + 1,);

    // Four siblings total: original + alt + funnier + darker.
    const count = await db
      .selectFrom("messages",)
      .select(db.fn.countAll<number>().as("n",),)
      .where("chat_id", "=", CHAT_ID,)
      .where("parent_id", "=", PARENT_ID,)
      .executeTakeFirst();
    expect(count?.n,).toBe(4,);
  });

  test("same style + same parent replays the pending variant (idempotency preserved per style)", async () => {
    const { db, } = await seed();

    const first = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, style: "funnier", },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const firstData = (await first.json()) as { variantMessageId: string };

    const second = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, style: "funnier", },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const secondData = (await second.json()) as { variantMessageId: string; replayed: boolean };
    expect(secondData.replayed,).toBe(true,);
    expect(secondData.variantMessageId,).toBe(firstData.variantMessageId,);
  });
});

// ── Variant generation drive (style → LLM payload) ────────────

const PROVIDER_NAME = "regen-capture-provider";
const FUNNIER_PROMPT = VALID_REGEN_STYLES.funnier ?? "";

/**
 * Provider double that records every complete() request so tests can assert
 * on the actual LLM payload (system message), plus an optional fail switch.
 */
class CapturingProvider implements LLMProvider {
  readonly capabilities: ProviderCapabilities = {
    type: "openai-compatible",
    label: "Regen Capture Mock",
    text: true,
    image: false,
    embeddings: false,
    streaming: false,
    tools: false,
    thinking: false,
  };
  failOnCall = false;
  readonly requests: ProviderRequest[] = [];

  /**
   * @param req
   */
  async complete(req: ProviderRequest,): Promise<GenerateResponse> {
    this.requests.push(req,);
    if (this.failOnCall) { throw new Error("Mock provider failure",); }
    return {
      content: "Styled mock response",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, },
    };
  }

  /**
   * Variant fill is forced non-streaming; stream() must never be reached.
   */
  async stream(_req: ProviderRequest, _handler: StreamHandler,): Promise<GenerateResponse> {
    throw new Error("stream not expected for variant fill",);
  }

  /** @returns ok probe. */
  healthCheck(): Promise<{ status: "ok" }> {
    return Promise.resolve({ status: "ok" as const, },);
  }

  /** @returns single mock model. */
  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([{ id: "mock-model", },],);
  }
}

/**
 * Deterministic config wiring the capturing provider as generation default
 * (schema defaults for everything else — mirrors generate-route.test.ts).
 */
function makeGenConfig(): Config {
  return {
    ...configSchema.defaults,
    generation: {
      providers: {
        openaiCompatible: [],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: undefined,
      },
      defaultProvider: PROVIDER_NAME,
      defaultModels: { [PROVIDER_NAME]: "mock-model", },
    },
  };
}

describe("handleRegenerate drives the variant LLM call (BUG-smart-regen-style-not-threaded-through)", () => {
  let provider: CapturingProvider;

  beforeEach(() => {
    createLogger({ level: "error", },);
    // Re-register a FRESH capture each test — the provider registry is
    // process-global and would otherwise keep the first instance (and its
    // recorded requests / failOnCall flag) alive across tests.
    if (getProvider(PROVIDER_NAME,) !== undefined) {
      unregisterProvider(PROVIDER_NAME,);
    }
    provider = new CapturingProvider();
    registerProvider(PROVIDER_NAME, provider,);
  },);

  afterAll(() => {
    if (getProvider(PROVIDER_NAME,) !== undefined) {
      unregisterProvider(PROVIDER_NAME,);
    }
    setTestDatabase(null,);
  },);

  test("style instruction reaches the LLM payload and fills the pending variant", async () => {
    const { db, } = await seed();
    setTestDatabase(db,);

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, style: "funnier", },
      db,
      { userId: USER_ID, userRole: "user", },
      makeGenConfig(),
    );
    expect(res.status,).toBe(200,);
    const data = await res.json() as {
      ok: boolean;
      replayed: boolean;
      variantMessageId: string;
      style: string | null;
    };
    expect(data.ok,).toBe(true,);
    expect(data.replayed,).toBe(false,);
    expect(data.style,).toBe("funnier",);

    // The LLM call itself carried the style instruction on the system message.
    expect(provider.requests,).toHaveLength(1,);
    const system = provider.requests[0]?.messages.find((m,) => m.role === "system");
    expect(system?.content,).toContain(FUNNIER_PROMPT,);

    // The pending variant row was filled in place (no extra sibling inserted).
    const variant = await db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", data.variantMessageId,)
      .executeTakeFirst();
    expect(variant?.status,).toBe("confirmed",);
    expect(variant?.content,).toBe("Styled mock response",);
    expect(variant?.idempotency_key,).toBe(`regen:variant:${PARENT_ID}:funnier`,);
    expect(variant?.swipe_index,).toBe(2,);

    // Original variant untouched.
    const original = await db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", ORIGINAL_ID,)
      .executeTakeFirst();
    expect(original?.status,).toBe("confirmed",);
    expect(original?.content,).toBe("Response A",);
  });

  test("plain regen (no style) sends no style instruction but still fills the variant", async () => {
    const { db, } = await seed();
    setTestDatabase(db,);

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
      makeGenConfig(),
    );
    expect(res.status,).toBe(200,);
    const data = await res.json() as { variantMessageId: string; style: string | null };
    expect(data.style,).toBeNull();

    expect(provider.requests,).toHaveLength(1,);
    const system = provider.requests[0]?.messages.find((m,) => m.role === "system");
    for (const instruction of Object.values(VALID_REGEN_STYLES,)) {
      expect(system?.content,).not.toContain(instruction,);
    }

    const variant = await db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", data.variantMessageId,)
      .executeTakeFirst();
    expect(variant?.status,).toBe("confirmed",);
    expect(variant?.content,).toBe("Styled mock response",);
    expect(variant?.idempotency_key,).toBe(`regen:variant:${PARENT_ID}:plain`,);
  });

  test("unknown style returns 400 with usage", async () => {
    const { db, } = await seed();

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, style: "louder", },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    expect(res.status,).toBe(400,);
    const data = await res.json() as { error: string };
    expect(data.error,).toContain("Invalid style",);
    expect(data.error,).toContain("funnier",);
  });

  test("provider failure degrades to the 200 contract and leaves the variant pending", async () => {
    const { db, } = await seed();
    setTestDatabase(db,);
    provider.failOnCall = true;

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, style: "darker", },
      db,
      { userId: USER_ID, userRole: "user", },
      makeGenConfig(),
    );
    expect(res.status,).toBe(200,);
    const data = await res.json() as { ok: boolean; variantMessageId: string; replayed: boolean };
    expect(data.ok,).toBe(true,);
    expect(data.replayed,).toBe(false,);

    const variant = await db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", data.variantMessageId,)
      .executeTakeFirst();
    expect(variant?.status,).toBe("sending",);
    expect(variant?.content,).toBe("Response A",);
  });
});
