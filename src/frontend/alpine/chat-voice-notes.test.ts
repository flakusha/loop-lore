import { beforeEach, describe, expect, test, } from "bun:test";
import { chatVoiceNoteMethods, } from "./chat-voice-notes";
import type { ChatState, } from "./types";

/** Minimal chat-state facade over the voice-note methods under test. */
function makeState(overrides: Record<string, unknown>,): ChatState {
  const state = {
    activeChat: "chat-1",
    loadMessages: async () => {},
    sendWithPreferredMode: async () => {},
    ...chatVoiceNoteMethods,
    ...overrides,
  };

  return state as unknown as ChatState;
}

/** Mock upload/message endpoints; returns recorded calls. */
function mockApiFetch(): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.apiFetch = (async (url: string, init?: RequestInit,) => {
    calls.push({ url, init, },);
    const body = url.includes("voice-notes",)
      ? JSON.stringify({ id: "asset-1", },)
      : JSON.stringify({ id: "msg-1", },);

    return new Response(body, { status: 201, },);
  }) as unknown as typeof fetch;

  return { calls, };
}

describe("chatVoiceNoteMethods", () => {
  beforeEach(() => {
    const g = globalThis as { MediaRecorder?: unknown };
    delete g.MediaRecorder;
  },);

  test("startVoiceRecording is a no-op without an active chat", async () => {
    const state = makeState({ activeChat: null, },);
    await state.startVoiceRecording();
    expect(state._voiceRecording,).toBe(false,);
  });

  test("startVoiceRecording is a no-op when MediaRecorder is missing", async () => {
    const state = makeState({},);
    await state.startVoiceRecording();
    expect(state._voiceRecording,).toBe(false,);
  });

  test("stopVoiceRecordingAndSend uploads then sends a voice-note attachment", async () => {
    const recorder = {
      mimeType: "audio/webm",
      stop: () => {},
      onstop: null as (() => void) | null,
      stream: { getTracks: () => [], },
    } as unknown as MediaRecorder;

    // The mock fires onstop synchronously from stop().
    (recorder as unknown as { stop: () => void }).stop = () => {
      (recorder as unknown as { onstop: (() => void) | null }).onstop?.();
    };

    const state = makeState({
      _voiceRecording: true,
      _voiceRecorder: recorder,
      _voiceChunks: [new Blob([new Uint8Array(8,),],),],
    },);

    const { calls, } = mockApiFetch();

    await state.stopVoiceRecordingAndSend();

    expect(state._voiceRecording,).toBe(false,);
    expect(state._voiceRecorder,).toBe(null,);
    expect(calls.length,).toBe(2,);
    expect(calls[0]!.url,).toContain("/chats/chat-1/voice-notes",);
    expect(calls[1]!.url,).toContain("/chats/chat-1/messages",);
    const body = JSON.parse(String((calls[1]!.init as { body: string }).body,),);
    expect(body.attachments[0].label,).toBe("voice-note",);
    expect(body.attachments[0].assetId,).toBe("asset-1",);
  });

  test("stopVoiceRecordingAndSend without a recorder is a no-op", async () => {
    const state = makeState({},);
    const { calls, } = mockApiFetch();
    await state.stopVoiceRecordingAndSend();
    expect(calls.length,).toBe(0,);
  });
});
