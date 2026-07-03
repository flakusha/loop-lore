// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import blessed from "blessed";

export class TUIApp {
  screen: blessed.Widgets.Screen;
  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "Loop Lore TUI",
    });

    this.screen.on("resize", () => {
      this.screen.emit("resize");
    });

    this.screen.key(["escape", "q", "C-c"], () => {
      process.exit(0);
    });

    this.screen.render();
  }
}

export const app = new TUIApp();
