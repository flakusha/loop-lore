// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Voice-note capture + send for chat (TASK-voice-notes-playback).
 *
 * MediaRecorder capture → POST /api/v1/chats/:id/voice-notes (audio
 * allowlist, 5MB cap) → the stored asset id rides the message-create
 * attachments array with `label: "voice-note"`; the bubble already renders
 * audio attachments with an inline `<audio controls>` player.
 */
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

export const chatVoiceNoteMethods: Partial<ChatState> & ThisType<ChatState> = {
  /** */
  _voiceRecording: false as boolean,

  /** */
  _voiceRecorder: null as MediaRecorder | null,

  /** */
  _voiceChunks: [] as Blob[],

  /**
   * Start capturing a voice note via MediaRecorder.
   * @returns {Promise<void>}
   */
  async startVoiceRecording() {
    if (!this.activeChat || this._voiceRecording) { return; }
    if (typeof MediaRecorder === "undefined") {
      globalThis.showToast?.(t("chats.voiceUnsupported",), "error",);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, },);
      const recorder = new MediaRecorder(stream,);
      this._voiceChunks = [];
      recorder.ondataavailable = (event,) => {
        if (event.data.size > 0) { this._voiceChunks.push(event.data,); }
      };

      recorder.start();
      this._voiceRecorder = recorder;
      this._voiceRecording = true;
    } catch {
      globalThis.showToast?.(t("chats.voiceMicDenied",), "error",);
    }
  },

  /**
   * Stop capture, upload the blob, and send it as a voice-note message.
   * @returns {Promise<void>}
   */
  async stopVoiceRecordingAndSend() {
    const recorder = this._voiceRecorder;
    const chatId = this.activeChat;
    if (!recorder || !chatId) { return; }
    this._voiceRecording = false;

    const stopped = new Promise<void>((resolve,) => {
      recorder.onstop = () => resolve();
    },);

    recorder.stop();
    await stopped;
    for (const track of recorder.stream.getTracks()) { track.stop(); }
    this._voiceRecorder = null;

    const blob = new Blob(this._voiceChunks, { type: recorder.mimeType || "audio/webm", },);
    this._voiceChunks = [];
    if (blob.size === 0) { return; }

    try {
      const form = new FormData();
      form.append(
        "file",
        new File([blob,], "voice-note.webm", { type: blob.type, },),
      );

      const upload = await apiFetch(`/api/v1/chats/${chatId}/voice-notes`, {
        method: "POST",
        body: form,
      },);

      if (!upload.ok) {
        globalThis.showToast?.(t("chats.voiceFailed",), "error",);
        return;
      }

      const asset = (await upload.json()) as { id: string };

      const res = await apiFetch(
        `/api/v1/chats/${chatId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            content: "🎙",
            attachments: [{ assetId: asset.id, order: 0, label: "voice-note", },],
          },),
          idempotencyKey: true,
        } as Parameters<typeof apiFetch>[1],
      );

      if (!res.ok) {
        globalThis.showToast?.(t("chats.voiceFailed",), "error",);
        return;
      }

      await this.loadMessages();
      await this.sendWithPreferredMode(chatId,);
    } catch {
      globalThis.showToast?.(t("chats.voiceFailed",), "error",);
    }
  },
};
