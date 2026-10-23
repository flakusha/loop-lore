// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { chatSettings, } from "./chat-settings";

// ── Network stub ──────────────────────────────────────────────────
// chat-settings.ts imports `apiFetch` from ./htmx (a direct ESM binding), so
// overriding globalThis.apiFetch would NOT intercept it. The chain is
// apiFetch → feFetch → safeFetch → globalThis.fetch, so fetch is stubbed and
// the real request chain runs (same approach as chat-editing.test.ts).
interface FetchCall {
  url: string;
  method: string;
  body: string | null;
}

const globals = globalThis as Record<string, unknown>;
const originalFetch = globalThis.fetch;
const originalDocument = globals.document;
const originalAlpine = globals.Alpine;

let calls: FetchCall[] = [];
let handler: (url: string, method: string, body: string | null,) => Promise<Response> = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];
let titleEl = { textContent: "", };

beforeEach(() => {
  calls = [];
  toasts = [];
  titleEl = { textContent: "", };
  handler = async () => Response.json({},);

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit,) => {
    const url = typeof input === "string" ? input : String(input,);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : null;
    calls.push({ url, method, body, },);
    return handler(url, method, body,);
  }) as unknown as typeof fetch;

  // Minimal DOM: only #page-title resolves; #vn-container stays null so the
  // VN renderer tears down instead of initialising a scene.
  globals.document = {
    querySelector: (selector: string,) => (selector === "#page-title" ? titleEl : null),
    cookie: "",
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const uiStore = { showChatSettings: false, };
  const chatStore: { currentChat: unknown } = { currentChat: null, };
  globals.Alpine = {
    store: (name: string,) => (name === "ui" ? uiStore : chatStore),
    initTree: () => {},
  };
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
  globals.document = originalDocument;
  globals.Alpine = originalAlpine;
},);

// ── Host ──────────────────────────────────────────────────────────
interface ChatRow {
  id: string;
  name?: string;
  mode?: string;
  turn_strategy?: string;
  thinking_visibility?: string;
  gm_config?: string;
  story_state?: string;
  custom_instructions?: string | null;
  world_id?: string;
}

/**
 * Runtime shape of the Alpine scope the chat-settings actions run against.
 * The index signature keeps the fixture readable; `unknown` values are
 * narrowed at each assertion site.
 */
interface Host {
  [key: string]: unknown;
  chats: ChatRow[];
  activeChat: string | null;
  messages: { status?: string }[];
  activeChatName: string;
}

/**
 * The methods under test, bound to a `Host` at call time. The module types
 * them against the full `ChatState`; the fixture only implements the members
 * these five actions touch.
 */
interface SettingsMethods {
  toggleDebugView(this: Host,): void;
  openChatSettings(this: Host,): Promise<void>;
  loadChatParticipants(this: Host,): Promise<void>;
  updateVnMode(this: Host,): void;
  saveChatSettings(this: Host,): Promise<void>;
}

const methods = chatSettings as unknown as SettingsMethods;

interface ActorModelsSeen {
  config: unknown;
}

/**
 * Build a fresh Alpine-scope host. Collaborators that live in other modules
 * (participant loading is real, the rest are stubs) are supplied here.
 * @param overrides
 * @returns {Host}
 */
function freshHost(overrides: Partial<Host> = {},): Host {
  const host: Host = {
    chats: [],
    activeChat: null,
    messages: [],
    activeChatName: "",
    _groupPaused: false,
  };

  // Real module state + methods (loadChatParticipants included).
  Object.assign(host, chatSettings,);

  // Collaborators owned by other modules — stubbed so this file only asserts
  // on chat-settings.ts behaviour.
  const actorModels: ActorModelsSeen[] = [];
  Object.assign(host, {
    isChatPaused: () => false,
    loadActorModels: (config: unknown,) => {
      actorModels.push({ config, },);
    },
    loadPromptTemplate: async () => {},
    loadQuickReplies: () => {},
    setPersona: async () => {},
    toggleImpersonation: async () => {},
    $dispatch: (_event: string, detail?: unknown,) => {
      const payload = detail as { type?: string; message?: string } | undefined;
      toasts.push({ type: payload?.type ?? "", message: payload?.message ?? "", },);
    },
  },);

  Object.assign(host, overrides,);
  host.actorModelsSeen = actorModels;
  return host;
}

/**
 * @param url
 * @returns {Record<string, unknown>}
 */
function bodyOf(url: string,): Record<string, unknown> {
  const call = calls.find((c,) => c.url === url);
  if (!call?.body) { return {}; }
  return JSON.parse(call.body,) as Record<string, unknown>;
}

describe("chatSettings.toggleDebugView", () => {
  test("flips the debug flag", () => {
    const host = freshHost();
    expect(host._debugView,).toBe(false,);
    methods.toggleDebugView.call(host,);
    expect(host._debugView,).toBe(true,);
    methods.toggleDebugView.call(host,);
    expect(host._debugView,).toBe(false,);
  });
});

describe("chatSettings.loadChatParticipants", () => {
  test("stores the participant list on success", async () => {
    handler = async () => Response.json([{ actor_id: "a1", name: "Ann", },],);
    const host = freshHost({ activeChat: "chat-1", },);
    await methods.loadChatParticipants.call(host,);
    expect(calls.map((c,) => c.url),).toEqual(["/api/v1/chats/chat-1/participants",],);
    expect(host._chatParticipants,).toEqual([{ actor_id: "a1", name: "Ann", },],);
  });

  test("no request without an active chat", async () => {
    const host = freshHost({ activeChat: null, },);
    await methods.loadChatParticipants.call(host,);
    expect(calls,).toEqual([],);
    expect(host._chatParticipants,).toEqual([],);
  });

  test("swallows a failed request and keeps the previous list", async () => {
    handler = async () => Response.json([{ actor_id: "a1", name: "Ann", },],);
    const host = freshHost({ activeChat: "chat-1", },);
    await methods.loadChatParticipants.call(host,);

    handler = async () => {
      throw new Error("network down",);
    };

    await methods.loadChatParticipants.call(host,);
    expect(host._chatParticipants,).toEqual([{ actor_id: "a1", name: "Ann", },],);
  });
});

describe("chatSettings.openChatSettings", () => {
  const gmConfig = JSON.stringify({
    type: "hybrid",
    humanGM: { actorId: "actor-1", },
    escalationThreshold: 0.8,
    llmConfig: { model: "model-x", provider: "prov-y", temperature: 0.3, maxTokens: 1234, },
    assistantTuning: { temperature: 0.5, maxTokens: 900, },
    responseLengthPreset: "custom",
    responseLengthCustom: 300,
    outputStyle: { preset: "epic", intensity: 0.9, },
    carriageEnabled: true,
    renderingOverride: "visual_novel",
    vnLayout: "split",
    vnTypewriter: false,
  },);

  test("maps chat row and gm_config onto the settings state", async () => {
    handler = async () => Response.json([],);
    const host = freshHost({
      activeChat: "chat-1",
      chats: [{
        id: "chat-1",
        name: "The Hunt",
        mode: "story",
        turn_strategy: "gm_first",
        thinking_visibility: "collapsed",
        gm_config: gmConfig,
        story_state: JSON.stringify({ autoTranslateLang: "de", },),
        custom_instructions: "keep it short",
      },],
      messages: [{ status: "confirmed", },],
    },);

    await methods.openChatSettings.call(host,);

    expect(host._chatSettingsName,).toBe("The Hunt",);
    expect(host._chatSettingsMode,).toBe("story",);
    expect(host._chatSettingsTurnStrategy,).toBe("gm_first",);
    expect(host._chatSettingsThinkingVisibility,).toBe("collapsed",);
    expect(host._chatOnline,).toBe(true,);
    expect(host._customInstructions,).toBe("keep it short",);
    // Legacy story_state key is the read-through fallback for the unified
    // gm_config.contentLanguage field.
    expect(host._chatContentLanguage,).toBe("de",);

    // GM fields
    expect(host._gmType,).toBe("hybrid",);
    expect(host._gmHumanActorId,).toBe("actor-1",);
    expect(host._gmEscalationThreshold,).toBe(0.8,);
    expect(host._gmModel,).toBe("model-x",);
    expect(host._gmProvider,).toBe("prov-y",);
    expect(host._gmTemperature,).toBe(0.3,);
    expect(host._gmMaxTokens,).toBe(1234,);
    expect(host._assistantTemperature,).toBe(0.5,);
    expect(host._assistantMaxTokens,).toBe(900,);
    expect(host._responseLengthPreset,).toBe("custom",);
    expect(host._responseLengthCustom,).toBe(300,);
    expect(host._outputStylePreset,).toBe("epic",);
    expect(host._outputStyleIntensity,).toBe(0.9,);
    expect(host._carriageEnabled,).toBe(true,);

    // VN presentation fields
    expect(host._vnEnabled,).toBe(true,);
    expect(host._vnLayout,).toBe("split",);
    expect(host._vnTypewriter,).toBe(false,);

    // The parsed config is handed to the actor-model loader.
    const seen = host.actorModelsSeen as ActorModelsSeen[];
    expect(seen.length,).toBe(1,);
    expect((seen[0]?.config as { type?: string }).type,).toBe("hybrid",);

    // The modal opens.
    const alpine = globals.Alpine as { store: (n: string,) => { showChatSettings: boolean } };
    expect(alpine.store("ui",).showChatSettings,).toBe(true,);
  });

  test("falls back to defaults for an unknown chat", async () => {
    const host = freshHost({ activeChat: "missing", chats: [], },);
    await methods.openChatSettings.call(host,);
    expect(host._chatSettingsName,).toBe("",);
    expect(host._chatSettingsMode,).toBe("story",);
    expect(host._chatSettingsTurnStrategy,).toBe("round_robin",);
    expect(host._chatSettingsThinkingVisibility,).toBe("hidden",);
    expect(host._chatOnline,).toBe(false,);
    expect(host._customInstructions,).toBe("",);
    expect(host._chatContentLanguage,).toBe("",);
    expect(host._gmType,).toBe("llm",);
    expect(host._gmModel,).toBe("",);
    expect(host._assistantTemperature,).toBeNull();
  });

  test("an offline chat is not online", async () => {
    const host = freshHost({
      activeChat: "chat-1",
      chats: [{ id: "chat-1", name: "Draft", },],
      messages: [{ status: "pending", },],
    },);

    await methods.openChatSettings.call(host,);
    expect(host._chatOnline,).toBe(false,);
  });
});

describe("chatSettings.updateVnMode", () => {
  test("does not throw for the active chat", () => {
    const host = freshHost({
      activeChat: "chat-1",
      chats: [{ id: "chat-1", name: "c", world_id: "world-9", },],
      messages: [],
    },);

    expect(() => methods.updateVnMode.call(host,)).not.toThrow();
  });
});

describe("chatSettings.saveChatSettings", () => {
  /**
   * @param overrides
   * @returns {Host}
   */
  function saveHost(overrides: Partial<Host> = {},): Host {
    return freshHost({
      activeChat: "chat-1",
      chats: [{ id: "chat-1", name: "Old name", turn_strategy: "round_robin", },],
      ...overrides,
    },);
  }

  test("does nothing without an active chat", async () => {
    const host = saveHost({ activeChat: null, },);
    host._chatSettingsName = "New name";
    await methods.saveChatSettings.call(host,);
    expect(calls,).toEqual([],);
    expect(toasts,).toEqual([],);
  });

  test("does nothing when the name is blank", async () => {
    const host = saveHost();
    host._chatSettingsName = "   ";
    await methods.saveChatSettings.call(host,);
    expect(calls,).toEqual([],);
    expect(toasts,).toEqual([],);
  });

  test("an offline chat sends the full gm_config", async () => {
    const host = saveHost();
    host._chatSettingsName = "  New name  ";
    host._chatSettingsMode = "story";
    host._chatSettingsTurnStrategy = "gm_first";
    host._chatSettingsThinkingVisibility = "visible";
    host._chatOnline = false;
    host._customInstructions = " be brief ";
    host._gmType = "llm";
    host._gmModel = "model-x";
    host._outputStylePreset = "epic";

    await methods.saveChatSettings.call(host,);

    const put = calls.find((c,) => c.method === "PUT");
    expect(put?.url,).toBe("/api/v1/chats/chat-1",);
    const body = bodyOf("/api/v1/chats/chat-1",);
    expect(body.name,).toBe("New name",);
    expect(body.isPaused,).toBe(false,);
    expect(body.thinkingVisibility,).toBe("visible",);
    expect(body.outputStylePreset,).toBe("epic",);
    expect(body.customInstructions,).toBe("be brief",);
    expect(body.mode,).toBe("story",);
    expect(body.turnStrategy,).toBe("gm_first",);
    const gm = body.gmConfig as Record<string, unknown>;
    expect(gm.type,).toBe("llm",);
    expect(gm.llmConfig,).toMatchObject({ model: "model-x", },);
  });

  test("an online chat sends only the presentation subset", async () => {
    const host = saveHost();
    host._chatSettingsName = "New name";
    host._chatOnline = true;
    host._gmType = "hybrid";
    host._gmModel = "model-x";

    await methods.saveChatSettings.call(host,);

    const body = bodyOf("/api/v1/chats/chat-1",);
    expect(body.mode,).toBeUndefined();
    expect(body.turnStrategy,).toBeUndefined();
    const gm = body.gmConfig as Record<string, unknown>;
    expect(gm.type,).toBeUndefined();
    expect(gm.llmConfig,).toBeUndefined();
    expect(gm.vnLayout,).toBe("overlay",);
  });

  test("clears the content language when no language is set", async () => {
    const host = saveHost();
    host._chatSettingsName = "New name";
    host._chatContentLanguage = "";
    await methods.saveChatSettings.call(host,);
    const translate = calls.find((c,) => c.url.includes("/auto-translate",));
    expect(translate?.method,).toBe("DELETE",);
  });

  test("sets the content language when a language is set", async () => {
    const host = saveHost();
    host._chatSettingsName = "New name";
    host._chatContentLanguage = " fr ";
    await methods.saveChatSettings.call(host,);
    const translate = calls.find((c,) => c.url.includes("/auto-translate",));
    expect(translate?.method,).toBe("PATCH",);
    expect(JSON.parse(translate?.body ?? "{}",) as Record<string, unknown>,).toEqual({ targetLang: "fr", },);
  });

  test("applies the saved values to the in-memory chat and closes the modal", async () => {
    const host = saveHost();
    host._chatSettingsName = "  Renamed  ";
    host._chatSettingsTurnStrategy = "gm_first";
    host._customInstructions = " notes ";
    host._groupPaused = true;

    await methods.saveChatSettings.call(host,);

    const chat = (host.chats as ChatRow[])[0];
    expect(chat?.name,).toBe("Renamed",);
    expect(chat?.turn_strategy,).toBe("gm_first",);
    expect(chat?.custom_instructions,).toBe("notes",);
    expect(JSON.parse(chat?.story_state ?? "{}",) as Record<string, unknown>,).toMatchObject({ isPaused: true, },);
    expect(host.activeChatName,).toBe("Renamed",);
    expect(titleEl.textContent,).toBe("Renamed",);
    const alpine = globals.Alpine as { store: (n: string,) => { showChatSettings: boolean } };
    expect(alpine.store("ui",).showChatSettings,).toBe(false,);
    expect(toasts,).toEqual([{ type: "success", message: "Chat settings saved", },],);
  });

  test("reports a network failure", async () => {
    const host = saveHost();
    host._chatSettingsName = "New name";
    handler = async () => {
      throw new Error("network down",);
    };

    await methods.saveChatSettings.call(host,);
    expect(toasts,).toEqual([{ type: "error", message: "Network error saving settings", },],);
  });
});
