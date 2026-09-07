import { afterEach, describe, expect, mock, test, } from "bun:test";
import { moodStateAvatars, } from "./avatars";

// ── Mock ../htmx (must precede importing ./avatars) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json([],);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

interface EmotionAvatar { emotion: string; avatarId: string; assetId: string }

interface AvatarCtx {
  activeChat: string | null;
  currentCharacter: { id: string; avatar_asset_id?: string } | null;
  _mood: { currentMood: string } | null;
  _emotionAvatarsLoading: boolean;
  _emotionAvatars: EmotionAvatar[];
  _currentEmotionAvatar: string | null;
  _emotionGenRunning: boolean;
  _emotionGenStatus: string;
  _emotionGenJobId: string | null;
}

/** Full avatar ctx: methods come from the module, fields are test-local. */
function buildCtx(overrides?: Partial<AvatarCtx>,): AvatarCtx {
  const ctx = {
    ...moodStateAvatars,
    activeChat: "chat-1",
    currentCharacter: null,
    _mood: null,
    _emotionAvatarsLoading: false,
    _emotionAvatars: [] as EmotionAvatar[],
    _currentEmotionAvatar: null,
    _emotionGenRunning: false,
    _emotionGenStatus: "",
    _emotionGenJobId: null,
    ...overrides,
  };
  return ctx as unknown as AvatarCtx;
}

const npcParticipants = [{ role_in_chat: "member", actor_type: "npc", actor_id: "actor-9", },];
const avatarRows = [
  { id: "av-happy", asset_id: "as-happy", tags: { emotion: "happy", }, },
  { id: "av-plain", asset_id: "as-plain", tags: {}, },
  { id: "av-neutral", asset_id: "as-neutral", tags: { emotion: "neutral", }, },
];

/** Route participant + avatar + generation endpoints; unhandled 404. */
function routeResponses(opts?: {
  participants?: unknown;
  avatars?: unknown;
  participantsStatus?: number;
  avatarsStatus?: number;
  generation?: Response;
  rejectParticipants?: boolean;
},): void {
  handler = async (url,) => {
    if (url.endsWith("/participants",)) {
      if (opts?.rejectParticipants) { throw new Error("offline",); }
      return opts?.participantsStatus
        ? new Response("", { status: opts.participantsStatus, },)
        : Response.json(opts?.participants ?? npcParticipants,);
    }
    if (url === "/api/actors/actor-9/avatars") {
      return opts?.avatarsStatus
        ? new Response("", { status: opts.avatarsStatus, },)
        : Response.json(opts?.avatars ?? avatarRows,);
    }
    if (url === "/api/actors/actor-9/emotion-avatars") {
      return opts?.generation ?? Response.json({ jobId: null, },);
    }
    return new Response("", { status: 404, },);
  };
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json([],);
});

describe("moodStateAvatars.loadEmotionAvatars", () => {
  test("returns early without an active chat", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await moodStateAvatars.loadEmotionAvatars!.call(ctx as never,);
    expect(calls,).toEqual([],);
    expect(ctx._emotionAvatarsLoading,).toBe(false,);
  });

  test("stops on non-ok participants and missing NPCs", async () => {
    const ctx = buildCtx();
    routeResponses({ participantsStatus: 500, },);
    await moodStateAvatars.loadEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionAvatars,).toEqual([],);
    routeResponses({ participants: [], },);
    await moodStateAvatars.loadEmotionAvatars!.call(ctx as never,);
    expect(calls,).toHaveLength(2,);
    expect(ctx._emotionAvatarsLoading,).toBe(false,);
  });

  test("collects emotion-tagged avatars and selects for the current mood", async () => {
    const ctx = buildCtx({ _mood: { currentMood: "neutral", }, },);
    routeResponses({},);
    await moodStateAvatars.loadEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionAvatars,).toEqual([
      { emotion: "happy", avatarId: "av-happy", assetId: "as-happy", },
      { emotion: "neutral", avatarId: "av-neutral", assetId: "as-neutral", },
    ],);
    expect(ctx._currentEmotionAvatar,).toBe("as-neutral",);
    expect(ctx._emotionAvatarsLoading,).toBe(false,);
  });

  test("keeps avatars but skips selection when no mood is loaded", async () => {
    const ctx = buildCtx();
    routeResponses({},);
    await moodStateAvatars.loadEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionAvatars,).toHaveLength(2,);
    expect(ctx._currentEmotionAvatar,).toBeNull();
  });

  test("ignores non-ok avatar responses and network failures", async () => {
    const ctx = buildCtx();
    routeResponses({ avatarsStatus: 500, },);
    await moodStateAvatars.loadEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionAvatars,).toEqual([],);
    routeResponses({ rejectParticipants: true, },);
    await moodStateAvatars.loadEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionAvatarsLoading,).toBe(false,);
  });
});

describe("moodStateAvatars.generateEmotionAvatars", () => {
  test("refuses to run without a chat or while already running", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await moodStateAvatars.generateEmotionAvatars!.call(ctx as never,);
    expect(calls,).toEqual([],);
    const busy = buildCtx({ _emotionGenRunning: true, },);
    await moodStateAvatars.generateEmotionAvatars!.call(busy as never,);
    expect(calls,).toEqual([],);
  });

  test("stops when no member NPC participates", async () => {
    const ctx = buildCtx();
    routeResponses({ participants: [], },);
    await moodStateAvatars.generateEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionGenStatus,).toBe("",);
  });

  test("reports a missing base avatar without starting a job", async () => {
    const ctx = buildCtx();
    routeResponses({},);
    await moodStateAvatars.generateEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionGenStatus,).not.toBe("",);
    expect(ctx._emotionGenJobId,).toBeNull();
    expect(ctx._emotionGenRunning,).toBe(false,);
  });

  test("surfaces the server message when generation fails to start", async () => {
    const ctx = buildCtx({ currentCharacter: { id: "c1", avatar_asset_id: "base-1", }, },);
    routeResponses({ generation: Response.json({ message: "queue full", }, { status: 503, },), },);
    await moodStateAvatars.generateEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionGenStatus,).toBe("queue full",);
    expect(ctx._emotionGenRunning,).toBe(false,);
  });

  test("falls back to a generic status when the failure body is not JSON", async () => {
    const ctx = buildCtx({ currentCharacter: { id: "c1", avatar_asset_id: "base-1", }, },);
    routeResponses({ generation: new Response("nope", { status: 500, },), },);
    await moodStateAvatars.generateEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionGenStatus,).not.toBe("",);
    expect(ctx._emotionGenStatus,).not.toBe("queue full",);
    expect(ctx._emotionGenJobId,).toBeNull();
  });

  test("records the no-job-id outcome when the server returns no job", async () => {
    const ctx = buildCtx({ currentCharacter: { id: "c1", avatar_asset_id: "base-1", }, },);
    routeResponses({},);
    await moodStateAvatars.generateEmotionAvatars!.call(ctx as never,);
    expect(ctx._emotionGenStatus,).not.toBe("",);
    expect(ctx._emotionGenJobId,).toBeNull();
    expect(ctx._emotionGenRunning,).toBe(false,);
  });
});

describe("moodStateAvatars._pollEmotionJob", () => {
  test("reports the no-job-id outcome immediately", async () => {
    const ctx = buildCtx();
    await moodStateAvatars._pollEmotionJob!.call(ctx as never, "actor-9", null,);
    expect(ctx._emotionGenStatus,).not.toBe("",);
    expect(calls,).toEqual([],);
  });

  test("skips polling entirely without a job id (no timers leak)", async () => {
    const ctx = buildCtx();
    await moodStateAvatars._pollEmotionJob!.call(ctx as never, "actor-9", "",);
    expect(calls,).toEqual([],);
  });
});

describe("moodStateAvatars.avatarForMessage", () => {
  test("hides avatars for user messages", () => {
    const ctx = buildCtx({
      currentCharacter: { id: "c1", avatar_asset_id: "base-1", },
      _emotionAvatars: [{ emotion: "happy", avatarId: "a", assetId: "as-happy", },],
    },);
    expect(moodStateAvatars.avatarForMessage!.call(ctx as never, { role: "user", emotion: "happy", },),).toBeNull();
  });

  test("prefers the exact emotion avatar", () => {
    const ctx = buildCtx({
      _emotionAvatars: [
        { emotion: "happy", avatarId: "a", assetId: "as-happy", },
        { emotion: "neutral", avatarId: "b", assetId: "as-neutral", },
      ],
    },);
    expect(moodStateAvatars.avatarForMessage!.call(ctx as never, { role: "assistant", emotion: "happy", },),).toBe("as-happy",);
  });

  test("falls back to neutral, then to the first available avatar", () => {
    const ctx = buildCtx({
      _emotionAvatars: [{ emotion: "neutral", avatarId: "b", assetId: "as-neutral", },],
    },);
    expect(moodStateAvatars.avatarForMessage!.call(ctx as never, { role: "assistant", emotion: "angry", },),).toBe("as-neutral",);
    const firstOnly = buildCtx({
      _emotionAvatars: [{ emotion: "happy", avatarId: "a", assetId: "as-first", },],
    },);
    expect(moodStateAvatars.avatarForMessage!.call(firstOnly as never, { role: "assistant", emotion: "angry", },),).toBe("as-first",);
  });

  test("uses the character base avatar when no emotion applies", () => {
    const ctx = buildCtx({ currentCharacter: { id: "c1", avatar_asset_id: "base-1", }, },);
    expect(moodStateAvatars.avatarForMessage!.call(ctx as never, { role: "assistant", },),).toBe("base-1",);
    const bare = buildCtx();
    expect(moodStateAvatars.avatarForMessage!.call(bare as never, { role: "assistant", },),).toBeNull();
  });
});

describe("moodStateAvatars.selectEmotionAvatar", () => {
  test("returns null for an empty avatar list", () => {
    const ctx = buildCtx();
    expect(moodStateAvatars.selectEmotionAvatar!.call(ctx as never, "happy",),).toBeNull();
  });

  test("selects the exact match and records it", () => {
    const ctx = buildCtx({
      _emotionAvatars: [
        { emotion: "happy", avatarId: "a", assetId: "as-happy", },
        { emotion: "neutral", avatarId: "b", assetId: "as-neutral", },
      ],
    },);
    expect(moodStateAvatars.selectEmotionAvatar!.call(ctx as never, "happy",),).toBe("as-happy",);
    expect(ctx._currentEmotionAvatar,).toBe("as-happy",);
  });

  test("falls back to neutral then to the first avatar", () => {
    const neutral = buildCtx({
      _emotionAvatars: [{ emotion: "neutral", avatarId: "b", assetId: "as-neutral", },],
    },);
    expect(moodStateAvatars.selectEmotionAvatar!.call(neutral as never, "sad",),).toBe("as-neutral",);
    expect(neutral._currentEmotionAvatar,).toBe("as-neutral",);
    const first = buildCtx({
      _emotionAvatars: [{ emotion: "happy", avatarId: "a", assetId: "as-first", },],
    },);
    expect(moodStateAvatars.selectEmotionAvatar!.call(first as never, "sad",),).toBe("as-first",);
  });
});
