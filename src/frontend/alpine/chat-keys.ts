// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { browserImportKey, } from "../browser";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "chat-keys", },);

export const chatKeys = {
  _chatKey: null as CryptoKey | null,
  _encryptionEnabled: false as boolean,
  _keyId: null as string | null,

  async loadChatKey(chatId: string,) {
    try {
      const res = await apiFetch(`/api/chats/${chatId}/encryption-key`,);
      if (!res.ok) {
        this._encryptionEnabled = false;
        this._chatKey = null;
        this._keyId = null;
        globalThis.__chatKey = null;
        globalThis.__chatKeyId = null;
        return;
      }
      const data = await res.json();
      this._chatKey = await browserImportKey(data.rawKey,);
      this._keyId = data.keyId;
      this._encryptionEnabled = true;
      globalThis.__chatKey = this._chatKey;
      globalThis.__chatKeyId = this._keyId;
      log.info("Encryption key loaded for chat", { chatId, keyId: data.keyId, },);
    } catch {
      this._encryptionEnabled = false;
      this._chatKey = null;
      this._keyId = null;
      globalThis.__chatKey = null;
      globalThis.__chatKeyId = null;
    }
  },
};
