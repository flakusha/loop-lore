// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../i18n";
import type { ChatState, } from "../types";

export const commandPalette: Partial<ChatState> & ThisType<ChatState> = {
  _showCommandPalette: false,
  _activeCommand: "",
  _commandList: [
    { name: "help", description: t("commands.help",), },
    { name: "roll", description: t("commands.roll",), },
    { name: "summarize", description: t("commands.summarize",), },
    { name: "impersonate", description: t("commands.impersonate",), },
    { name: "narrate", description: t("commands.narrate",), },
    { name: "ooc", description: t("commands.ooc",), },
    { name: "debug", description: t("commands.debug",), },
    { name: "detail", description: t("commands.detail",), },
    { name: "improve", description: t("commands.improve",), },
    { name: "context", description: t("commands.context",), },
    { name: "image", description: t("commands.image",), },
    { name: "quest", description: t("commands.quest",), },
    { name: "video", description: t("commands.video",), },
    { name: "sfx", description: t("commands.sfx",), },
    { name: "sound", description: t("commands.sound",), },
    { name: "music", description: t("commands.music",), },
    { name: "caption", description: t("commands.caption",), },
    { name: "create", description: t("commands.create",), },
    { name: "rewrite", description: t("commands.rewrite",), },
    { name: "translate", description: t("commands.translate",), },
    { name: "review", description: t("commands.review",), },
    { name: "clear", description: t("commands.clear",), },
    { name: "stats", description: t("commands.stats",), },
  ] as { name: string; description: string }[],
  _filteredCommands: [] as { name: string; description: string }[],

  handleCommandInput(event: Event,) {
    const input = event.target as HTMLTextAreaElement;
    const value = input.value;
    if (value.startsWith("/",) && !value.includes(" ",)) {
      const query = value.slice(1,).toLowerCase();
      this._showCommandPalette = true;
      if (query) {
        const filtered: typeof this._commandList = [];
        for (const c of this._commandList) { if (c.name.includes(query,)) { filtered.push(c,); } }
        this._filteredCommands = filtered;
      } else {
        this._filteredCommands = this._commandList;
      }
    } else {
      this._showCommandPalette = false;
    }
  },

  selectCommand(name: string,) {
    const input = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (input) {
      input.value = `/${name} `;
      input.focus();
    }
    this._showCommandPalette = false;
  },
};
